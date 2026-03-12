#define _CRT_SECURE_NO_WARNINGS
#define WIN32_LEAN_AND_MEAN

#include <winsock2.h>
#include <ws2tcpip.h>

#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

double asm_add(double left, double right);
double asm_sub(double left, double right);
double asm_mul(double left, double right);
double asm_div(double left, double right);

static bool send_all(SOCKET client, const char *buffer, size_t length) {
  size_t sent_total = 0;

  while (sent_total < length) {
    int sent_now = send(client, buffer + sent_total, (int)(length - sent_total), 0);

    if (sent_now == SOCKET_ERROR) {
      return false;
    }

    sent_total += (size_t)sent_now;
  }

  return true;
}

static void send_response(
    SOCKET client,
    const char *status,
    const char *content_type,
    const char *body,
    size_t body_length) {
  char header[512];
  int header_length = snprintf(
      header,
      sizeof(header),
      "HTTP/1.1 %s\r\n"
      "Content-Type: %s\r\n"
      "Content-Length: %zu\r\n"
      "Cache-Control: no-store\r\n"
      "Access-Control-Allow-Origin: *\r\n"
      "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
      "Access-Control-Allow-Headers: Content-Type\r\n"
      "Connection: close\r\n\r\n",
      status,
      content_type,
      body_length);

  if (header_length > 0) {
    send_all(client, header, (size_t)header_length);
  }

  if (body_length > 0) {
    send_all(client, body, body_length);
  }
}

static bool read_file(const char *path, char **buffer, size_t *length) {
  FILE *file = fopen(path, "rb");
  long size = 0;
  char *data = NULL;

  if (!file) {
    return false;
  }

  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return false;
  }

  size = ftell(file);
  if (size < 0) {
    fclose(file);
    return false;
  }

  if (fseek(file, 0, SEEK_SET) != 0) {
    fclose(file);
    return false;
  }

  data = (char *)malloc((size_t)size);
  if (!data) {
    fclose(file);
    return false;
  }

  if (size > 0 && fread(data, 1, (size_t)size, file) != (size_t)size) {
    free(data);
    fclose(file);
    return false;
  }

  fclose(file);
  *buffer = data;
  *length = (size_t)size;
  return true;
}

static void serve_file(SOCKET client, const char *path, const char *content_type) {
  char *buffer = NULL;
  size_t length = 0;

  if (!read_file(path, &buffer, &length)) {
    const char *body = "Not Found";
    send_response(client, "404 Not Found", "text/plain; charset=utf-8", body, strlen(body));
    return;
  }

  send_response(client, "200 OK", content_type, buffer, length);
  free(buffer);
}

static bool query_value(const char *query, const char *key, char *output, size_t output_size) {
  size_t key_length = strlen(key);
  const char *cursor = query;

  while (cursor && *cursor) {
    if (strncmp(cursor, key, key_length) == 0 && cursor[key_length] == '=') {
      cursor += key_length + 1;

      size_t index = 0;
      while (cursor[index] != '\0' && cursor[index] != '&' && index + 1 < output_size) {
        output[index] = cursor[index];
        index++;
      }

      output[index] = '\0';
      return index > 0;
    }

    cursor = strchr(cursor, '&');
    if (cursor) {
      cursor++;
    }
  }

  return false;
}

static void send_json_error(SOCKET client, const char *status, const char *message) {
  char body[256];
  int length = snprintf(body, sizeof(body), "{\"ok\":false,\"error\":\"%s\"}", message);

  if (length < 0) {
    return;
  }

  send_response(client, status, "application/json; charset=utf-8", body, (size_t)length);
}

static void format_number(double value, char *output, size_t output_size) {
  snprintf(output, output_size, "%.15g", value);
}

static void handle_health(SOCKET client) {
  const char *body = "{\"ok\":true,\"service\":\"calc_server\"}";
  send_response(client, "200 OK", "application/json; charset=utf-8", body, strlen(body));
}

static void handle_calc(SOCKET client, const char *query) {
  char op[16];
  char left_raw[64];
  char right_raw[64];
  char result_text[64];
  char body[256];
  char *left_end = NULL;
  char *right_end = NULL;
  double left = 0.0;
  double right = 0.0;
  double result = 0.0;
  int body_length = 0;

  if (!query ||
      !query_value(query, "op", op, sizeof(op)) ||
      !query_value(query, "a", left_raw, sizeof(left_raw)) ||
      !query_value(query, "b", right_raw, sizeof(right_raw))) {
    send_json_error(client, "400 Bad Request", "Missing query parameters");
    return;
  }

  left = strtod(left_raw, &left_end);
  right = strtod(right_raw, &right_end);

  if (left_end == left_raw || *left_end != '\0' || right_end == right_raw || *right_end != '\0') {
    send_json_error(client, "400 Bad Request", "Invalid number");
    return;
  }

  if (strcmp(op, "add") == 0) {
    result = asm_add(left, right);
  } else if (strcmp(op, "sub") == 0) {
    result = asm_sub(left, right);
  } else if (strcmp(op, "mul") == 0) {
    result = asm_mul(left, right);
  } else if (strcmp(op, "div") == 0) {
    if (right == 0.0) {
      send_json_error(client, "400 Bad Request", "Division by zero");
      return;
    }

    result = asm_div(left, right);
  } else {
    send_json_error(client, "400 Bad Request", "Unsupported operation");
    return;
  }

  if (!isfinite(result)) {
    send_json_error(client, "500 Internal Server Error", "Non-finite result");
    return;
  }

  format_number(result, result_text, sizeof(result_text));
  body_length = snprintf(
      body,
      sizeof(body),
      "{\"ok\":true,\"result\":%.15g,\"resultText\":\"%s\"}",
      result,
      result_text);

  if (body_length < 0) {
    send_json_error(client, "500 Internal Server Error", "Response formatting failed");
    return;
  }

  send_response(client, "200 OK", "application/json; charset=utf-8", body, (size_t)body_length);
}

static void route_request(SOCKET client, const char *request) {
  char method[8] = {0};
  char target[1024] = {0};
  char path[1024] = {0};
  char *query = NULL;

  if (sscanf(request, "%7s %1023s", method, target) != 2) {
    send_json_error(client, "400 Bad Request", "Malformed request line");
    return;
  }

  if (strcmp(method, "OPTIONS") == 0) {
    send_response(client, "204 No Content", "text/plain; charset=utf-8", "", 0);
    return;
  }

  if (strcmp(method, "GET") != 0) {
    send_json_error(client, "405 Method Not Allowed", "Only GET is supported");
    return;
  }

  strncpy(path, target, sizeof(path) - 1);
  query = strchr(path, '?');
  if (query) {
    *query = '\0';
    query++;
  }

  if (strcmp(path, "/") == 0 || strcmp(path, "/index.html") == 0) {
    serve_file(client, "react-calculator.html", "text/html; charset=utf-8");
    return;
  }

  if (strcmp(path, "/react-calculator.css") == 0) {
    serve_file(client, "react-calculator.css", "text/css; charset=utf-8");
    return;
  }

  if (strcmp(path, "/react-calculator.tsx") == 0) {
    serve_file(client, "react-calculator.tsx", "text/plain; charset=utf-8");
    return;
  }

  if (strcmp(path, "/health") == 0) {
    handle_health(client);
    return;
  }

  if (strcmp(path, "/api/calc") == 0) {
    handle_calc(client, query);
    return;
  }

  send_json_error(client, "404 Not Found", "Route not found");
}

int main(void) {
  WSADATA wsadata;
  SOCKET server_socket = INVALID_SOCKET;
  struct sockaddr_in address;
  int address_length = sizeof(address);
  int startup_result = 0;

  startup_result = WSAStartup(MAKEWORD(2, 2), &wsadata);
  if (startup_result != 0) {
    fprintf(stderr, "WSAStartup failed: %d\n", startup_result);
    return 1;
  }

  server_socket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (server_socket == INVALID_SOCKET) {
    fprintf(stderr, "socket creation failed\n");
    WSACleanup();
    return 1;
  }

  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons(8080);
  address.sin_addr.s_addr = htonl(INADDR_ANY);

  if (bind(server_socket, (struct sockaddr *)&address, sizeof(address)) == SOCKET_ERROR) {
    fprintf(stderr, "bind failed\n");
    closesocket(server_socket);
    WSACleanup();
    return 1;
  }

  if (listen(server_socket, SOMAXCONN) == SOCKET_ERROR) {
    fprintf(stderr, "listen failed\n");
    closesocket(server_socket);
    WSACleanup();
    return 1;
  }

  printf("Calculator server listening on http://127.0.0.1:8080\n");

  for (;;) {
    SOCKET client_socket = accept(server_socket, (struct sockaddr *)&address, &address_length);

    if (client_socket == INVALID_SOCKET) {
      continue;
    }

    char request_buffer[8192];
    int received = recv(client_socket, request_buffer, sizeof(request_buffer) - 1, 0);

    if (received > 0) {
      request_buffer[received] = '\0';
      route_request(client_socket, request_buffer);
    }

    closesocket(client_socket);
  }

  closesocket(server_socket);
  WSACleanup();
  return 0;
}
