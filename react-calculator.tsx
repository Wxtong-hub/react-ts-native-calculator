type Operation = "add" | "sub" | "mul" | "div";
type ApiStatus = "checking" | "live" | "offline";

type HistoryEntry = {
  expression: string;
  result: string;
  timestamp: string;
};

type CalcResponse = {
  ok: boolean;
  result?: number;
  resultText?: string;
  error?: string;
};

const operationSymbol: Record<Operation, string> = {
  add: "+",
  sub: "-",
  mul: "x",
  div: "/",
};

const operationLabel: Record<Operation, string> = {
  add: "Add",
  sub: "Subtract",
  mul: "Multiply",
  div: "Divide",
};

const statusCopy: Record<ApiStatus, string> = {
  checking: "Checking C service",
  live: "C + ASM backend online",
  offline: "Backend offline",
};

function stamp(): string {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trimDisplay(value: string): string {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 16)}...`;
}

function formatLocalNumber(value: string): string {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(numeric);
}

const App: React.FC = () => {
  const [display, setDisplay] = React.useState<string>("0");
  const [storedValue, setStoredValue] = React.useState<string | null>(null);
  const [pendingOperation, setPendingOperation] = React.useState<Operation | null>(null);
  const [replaceDisplay, setReplaceDisplay] = React.useState<boolean>(true);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [apiStatus, setApiStatus] = React.useState<ApiStatus>("checking");
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [notice, setNotice] = React.useState<string>("Ready for first input");

  React.useEffect(() => {
    fetch("/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Health endpoint failed");
        }

        setApiStatus("live");
        setNotice("Backend heartbeat looks healthy");
      })
      .catch(() => {
        setApiStatus("offline");
        setNotice("Backend not responding on /health");
      });
  }, []);

  const expression = React.useMemo(() => {
    if (pendingOperation && storedValue !== null) {
      const rightSide = replaceDisplay ? "..." : display;
      return `${storedValue} ${operationSymbol[pendingOperation]} ${rightSide}`;
    }

    return "Enter a number to begin";
  }, [display, pendingOperation, replaceDisplay, storedValue]);

  const clearAll = React.useCallback(() => {
    setDisplay("0");
    setStoredValue(null);
    setPendingOperation(null);
    setReplaceDisplay(true);
    setNotice("Cleared calculator state");
  }, []);

  const appendDigit = React.useCallback(
    (token: string) => {
      if (isLoading) {
        return;
      }

      if (replaceDisplay) {
        setDisplay(token === "." ? "0." : token);
        setReplaceDisplay(false);
        return;
      }

      if (token === "." && display.includes(".")) {
        return;
      }

      if (display === "0" && token !== ".") {
        setDisplay(token);
        return;
      }

      setDisplay(`${display}${token}`);
    },
    [display, isLoading, replaceDisplay],
  );

  const backspace = React.useCallback(() => {
    if (isLoading || replaceDisplay) {
      return;
    }

    if (display.length <= 1 || (display.length === 2 && display.startsWith("-"))) {
      setDisplay("0");
      setReplaceDisplay(true);
      return;
    }

    setDisplay(display.slice(0, -1));
  }, [display, isLoading, replaceDisplay]);

  const toggleSign = React.useCallback(() => {
    if (isLoading || display === "0") {
      return;
    }

    if (display.startsWith("-")) {
      setDisplay(display.slice(1));
      return;
    }

    setDisplay(`-${display}`);
  }, [display, isLoading]);

  const toPercent = React.useCallback(() => {
    if (isLoading) {
      return;
    }

    const numeric = Number(display);
    const next = `${numeric / 100}`;
    setDisplay(next);
    setReplaceDisplay(false);
    setNotice("Converted current input to percent");
  }, [display, isLoading]);

  const requestCalculation = React.useCallback(
    async (nextOperation: Operation | null) => {
      if (!pendingOperation || storedValue === null) {
        if (nextOperation) {
          setStoredValue(display);
          setPendingOperation(nextOperation);
          setReplaceDisplay(true);
          setNotice(`Queued ${operationLabel[nextOperation]} operation`);
        }

        return;
      }

      if (pendingOperation === "div" && Number(display) === 0) {
        setNotice("Division by zero is blocked");
        setDisplay("0");
        setStoredValue(null);
        setPendingOperation(null);
        setReplaceDisplay(true);
        return;
      }

      setIsLoading(true);

      try {
        const params = new URLSearchParams({
          op: pendingOperation,
          a: storedValue,
          b: display,
        });

        const response = await fetch(`/api/calc?${params.toString()}`);
        const payload = (await response.json()) as CalcResponse;

        if (!response.ok || !payload.ok || !payload.resultText) {
          throw new Error(payload.error || "Calculation failed");
        }

        const expressionLabel = `${storedValue} ${operationSymbol[pendingOperation]} ${display}`;
        const resultText = payload.resultText;

        setDisplay(resultText);
        setStoredValue(nextOperation ? resultText : null);
        setPendingOperation(nextOperation);
        setReplaceDisplay(true);
        setApiStatus("live");
        setHistory((current) => [
          {
            expression: expressionLabel,
            result: resultText,
            timestamp: stamp(),
          },
          ...current,
        ].slice(0, 6));

        if (nextOperation) {
          setNotice(`Calculated ${expressionLabel}, next op: ${operationLabel[nextOperation]}`);
        } else {
          setNotice(`Calculated ${expressionLabel}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown backend error";
        setApiStatus("offline");
        setNotice(message);
        setStoredValue(null);
        setPendingOperation(null);
        setReplaceDisplay(true);
      } finally {
        setIsLoading(false);
      }
    },
    [display, pendingOperation, storedValue],
  );

  const chooseOperation = React.useCallback(
    (operation: Operation) => {
      if (isLoading) {
        return;
      }

      if (storedValue !== null && pendingOperation !== null && !replaceDisplay) {
        void requestCalculation(operation);
        return;
      }

      setStoredValue(display);
      setPendingOperation(operation);
      setReplaceDisplay(true);
      setNotice(`Queued ${operationLabel[operation]} operation`);
    },
    [display, isLoading, pendingOperation, replaceDisplay, requestCalculation, storedValue],
  );

  const runEquals = React.useCallback(() => {
    if (isLoading) {
      return;
    }

    void requestCalculation(null);
  }, [isLoading, requestCalculation]);

  const metrics = [
    { label: "Frontend", value: "React + TypeScript" },
    { label: "Backend", value: "C API" },
    { label: "Math Core", value: "x86_64 ASM" },
  ];

  const stackItems = [
    { label: "Endpoint", value: "/api/calc?op=add&a=12&b=30" },
    { label: "Health", value: "/health" },
    { label: "Rendering", value: "Static page served by calc_server" },
  ];

  return (
    <div className="app-shell">
      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">Hybrid Stack Calculator</div>
          <h1>React TS front, C and assembly behind.</h1>
          <p>
            This calculator keeps the interface sharp and modern while the actual arithmetic runs
            through a native C service and dedicated assembly routines.
          </p>

          <div className="hero-grid">
            {metrics.map((metric) => (
              <div className="metric" key={metric.label}>
                <div className="metric-label">{metric.label}</div>
                <div className="metric-value">{metric.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-card status-card">
          <div>
            <div className="status-pill">
              <span className={`status-dot ${apiStatus}`}></span>
              <span>{statusCopy[apiStatus]}</span>
            </div>
            <div className="status-note">
              {apiStatus === "live"
                ? "Open the local service, hit the keypad, and every operation goes through the native backend."
                : "Start the C server first. The React UI will automatically detect when the backend comes online."}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Session note</div>
            <div className="metric-value">{notice}</div>
          </div>
        </div>
      </section>

      <section className="main-grid">
        <div className="calculator-card">
          <div className="display-panel">
            <div className="display-label">Current expression</div>
            <div className="display-expression">{expression}</div>
            <div className="display-value">{trimDisplay(display)}</div>
            <div className="notice-bar">
              <span>{isLoading ? "Computing in native backend..." : "Ready"}</span>
              <span>{formatLocalNumber(display)}</span>
            </div>
          </div>

          <div className="keypad">
            <button className="key utility" onClick={clearAll} type="button">
              <span className="key-label">AC</span>
              <small>reset</small>
            </button>
            <button className="key utility" onClick={toggleSign} type="button">
              <span className="key-label">+/-</span>
              <small>sign</small>
            </button>
            <button className="key utility" onClick={toPercent} type="button">
              <span className="key-label">%</span>
              <small>ratio</small>
            </button>
            <button className="key operator" onClick={() => chooseOperation("div")} type="button">
              <span className="key-label">/</span>
              <small>divide</small>
            </button>

            <button className="key" onClick={() => appendDigit("7")} type="button">
              <span className="key-label">7</span>
              <small>digit</small>
            </button>
            <button className="key" onClick={() => appendDigit("8")} type="button">
              <span className="key-label">8</span>
              <small>digit</small>
            </button>
            <button className="key" onClick={() => appendDigit("9")} type="button">
              <span className="key-label">9</span>
              <small>digit</small>
            </button>
            <button className="key operator" onClick={() => chooseOperation("mul")} type="button">
              <span className="key-label">x</span>
              <small>multiply</small>
            </button>

            <button className="key" onClick={() => appendDigit("4")} type="button">
              <span className="key-label">4</span>
              <small>digit</small>
            </button>
            <button className="key" onClick={() => appendDigit("5")} type="button">
              <span className="key-label">5</span>
              <small>digit</small>
            </button>
            <button className="key" onClick={() => appendDigit("6")} type="button">
              <span className="key-label">6</span>
              <small>digit</small>
            </button>
            <button className="key operator" onClick={() => chooseOperation("sub")} type="button">
              <span className="key-label">-</span>
              <small>subtract</small>
            </button>

            <button className="key" onClick={() => appendDigit("1")} type="button">
              <span className="key-label">1</span>
              <small>digit</small>
            </button>
            <button className="key" onClick={() => appendDigit("2")} type="button">
              <span className="key-label">2</span>
              <small>digit</small>
            </button>
            <button className="key" onClick={() => appendDigit("3")} type="button">
              <span className="key-label">3</span>
              <small>digit</small>
            </button>
            <button className="key operator" onClick={() => chooseOperation("add")} type="button">
              <span className="key-label">+</span>
              <small>add</small>
            </button>

            <button className="key utility zero" onClick={() => appendDigit("0")} type="button">
              <span className="key-label">0</span>
              <small>digit</small>
            </button>
            <button className="key" onClick={() => appendDigit(".")} type="button">
              <span className="key-label">.</span>
              <small>decimal</small>
            </button>
            <button className="key utility" onClick={backspace} type="button">
              <span className="key-label">DEL</span>
              <small>back</small>
            </button>
            <button className="key equals" onClick={runEquals} type="button">
              <span className="key-label">=</span>
              <small>solve</small>
            </button>
          </div>
        </div>

        <div className="meta-column">
          <div className="meta-card">
            <h2 className="meta-title">Stack map</h2>
            <div className="stack-list">
              {stackItems.map((item) => (
                <div className="stack-item" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="meta-card">
            <h2 className="meta-title">Latest calculations</h2>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="history-empty">
                  Your results will appear here after the first call to the native API.
                </div>
              ) : (
                history.map((entry) => (
                  <div className="history-item" key={`${entry.expression}-${entry.timestamp}`}>
                    <time>{entry.timestamp}</time>
                    <div className="history-main">{entry.expression}</div>
                    <div className="history-result">= {entry.result}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const rootNode = document.getElementById("root");

if (!rootNode) {
  throw new Error("Missing root node");
}

ReactDOM.createRoot(rootNode).render(<App />);
