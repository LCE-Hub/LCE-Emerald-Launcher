#include "Net/LceRelay.hpp"
#include "Core/Log.hpp"
#include <chrono>
#include <cstring>
#include <thread>
#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <netdb.h>
#include <netinet/in.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>
#endif
namespace emerald::lce {
namespace {
constexpr const char *kProxyAddr = "proxy.mclegacyedition.xyz";
constexpr std::uint16_t kProxyPort = 2052;
constexpr std::uint16_t kJoinPort = 61000;
#ifdef _WIN32
using socket_t = SOCKET;
constexpr socket_t kInvalidSocket = INVALID_SOCKET;
#else
using socket_t = int;
constexpr socket_t kInvalidSocket = -1;
#endif
void net_init() {
#ifdef _WIN32
  static const bool initialized = [] {
    WSADATA data;
    return WSAStartup(MAKEWORD(2, 2), &data) == 0;
  }();
  (void)initialized;
#endif
}

std::string socket_error() {
#ifdef _WIN32
  return "winsock error " + std::to_string(WSAGetLastError());
#else
  return std::strerror(errno);
#endif
}

void close_socket(socket_t handle) {
#ifdef _WIN32
  ::closesocket(handle);
#else
  ::close(handle);
#endif
}

socket_t connect_tcp(const std::string &host, std::uint16_t port,
                     std::string &error) {
  net_init();
  addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  addrinfo *results = nullptr;
  const std::string service = std::to_string(port);
  if (::getaddrinfo(host.c_str(), service.c_str(), &hints, &results) != 0 ||
      results == nullptr) {
    error = "DNS lookup failed for " + host;
    return kInvalidSocket;
  }
  socket_t handle = kInvalidSocket;
  std::string last_error;
  for (addrinfo *entry = results; entry != nullptr; entry = entry->ai_next) {
    const socket_t candidate =
        ::socket(entry->ai_family, entry->ai_socktype, entry->ai_protocol);
    if (candidate == kInvalidSocket) {
      continue;
    }
    if (::connect(candidate, entry->ai_addr,
                  static_cast<int>(entry->ai_addrlen)) == 0) {
      handle = candidate;
      break;
    }
    last_error = socket_error();
    close_socket(candidate);
  }
  ::freeaddrinfo(results);
  if (handle == kInvalidSocket && !last_error.empty()) {
    error = last_error;
  }
  return handle;
}

bool read_line(socket_t handle, std::string &line) {
  line.clear();
  char byte = 0;
  while (true) {
#ifdef _WIN32
    const int received = static_cast<int>(::recv(handle, &byte, 1, 0));
#else
    const ssize_t received = ::recv(handle, &byte, 1, 0);
#endif
    if (received <= 0) {
      return false;
    }
    if (byte == '\n') {
      return true;
    }
    if (byte != '\r') {
      line.push_back(byte);
    }
  }
}

bool write_line(socket_t handle, const std::string &line) {
  const std::string data = line + "\n";
  std::size_t sent = 0;
  while (sent < data.size()) {
#ifdef _WIN32
    const int result =
        ::send(handle, data.data() + sent, static_cast<int>(data.size() - sent),
               0);
#else
    const ssize_t result =
        ::send(handle, data.data() + sent, data.size() - sent, 0);
#endif
    if (result <= 0) {
      return false;
    }
    sent += static_cast<std::size_t>(result);
  }
  return true;
}

void copy_bidirectional(socket_t a, socket_t b) {
  char buffer[8192];
  std::size_t outbound = 0;
  std::size_t inbound = 0;
  const auto log_totals = [&] {
    core::info("lcerelay: relay session ended (game -> proxy " +
               std::to_string(outbound) + " B, proxy -> game " +
               std::to_string(inbound) + " B)");
  };
  while (true) {
    fd_set readable;
    FD_ZERO(&readable);
    FD_SET(a, &readable);
    FD_SET(b, &readable);
#ifdef _WIN32
    if (::select(0, &readable, nullptr, nullptr, nullptr) <= 0) {
#else
    const int highest = (a > b ? a : b) + 1;
    if (::select(highest, &readable, nullptr, nullptr, nullptr) <= 0) {
#endif
      log_totals();
      return;
    }
#ifdef _WIN32
#define RELAY_IS_SET(fd) (FD_ISSET(fd, &readable) != 0)
#define RELAY_RECV(fd) ::recv(fd, buffer, sizeof(buffer), 0)
#define RELAY_SEND(fd, size) ::send(fd, buffer, static_cast<int>(size), 0)
#else
#define RELAY_IS_SET(fd) (FD_ISSET(fd, &readable) != 0)
#define RELAY_RECV(fd) ::recv(fd, buffer, sizeof(buffer), 0)
#define RELAY_SEND(fd, size) ::send(fd, buffer, static_cast<size_t>(size), 0)
#endif
    if (RELAY_IS_SET(a)) {
      const int received = static_cast<int>(RELAY_RECV(a));
      if (received <= 0) {
        log_totals();
        return;
      }
      if (/*core::verbose()*/ true) {
        core::info("lcerelay: packet " + std::to_string(received) +
                   " B game -> proxy");
      }
      outbound += static_cast<std::size_t>(received);
      if (RELAY_SEND(b, received) < 0) {
        log_totals();
        return;
      }
    }
    if (RELAY_IS_SET(b)) {
      const int received = static_cast<int>(RELAY_RECV(b));
      if (received <= 0) {
        log_totals();
        return;
      }
      if (/*core::verbose()*/ true) {
        core::info("lcerelay: packet " + std::to_string(received) +
                   " B proxy -> game");
      }
      inbound += static_cast<std::size_t>(received);
      if (RELAY_SEND(a, received) < 0) {
        log_totals();
        return;
      }
    }
  }
}

socket_t bind_listen(std::uint16_t port, std::string &error) {
  net_init();
  const socket_t handle = ::socket(AF_INET, SOCK_STREAM, 0);
  if (handle == kInvalidSocket) {
    error = "failed to create relay socket";
    return kInvalidSocket;
  }
  int reuse = 1;
  ::setsockopt(handle, SOL_SOCKET, SO_REUSEADDR,
               reinterpret_cast<const char *>(&reuse), sizeof(reuse));
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_ANY);
  address.sin_port = htons(port);
  if (::bind(handle, reinterpret_cast<const sockaddr *>(&address),
             sizeof(address)) != 0 ||
      ::listen(handle, 1) != 0) {
    error = "failed to bind relay port " + std::to_string(port) + ": " +
            socket_error();
    close_socket(handle);
    return kInvalidSocket;
  }
  return handle;
}
} // namespace

LceRelay::~LceRelay() {
  stop_all();
}

void LceRelay::set_error(const std::string &message) {
  std::lock_guard<std::mutex> lock(error_mutex_);
  last_error_ = message;
  core::warn("lcerelay: " + message);
}

void LceRelay::track(std::intptr_t socket) {
  std::lock_guard<std::mutex> lock(sockets_mutex_);
  sockets_.push_back(socket);
}

void LceRelay::untrack(std::intptr_t socket) {
  std::lock_guard<std::mutex> lock(sockets_mutex_);
  for (std::size_t index = 0; index < sockets_.size(); ++index) {
    if (sockets_[index] == socket) {
      sockets_.erase(sockets_.begin() + static_cast<long>(index));
      return;
    }
  }
}

std::string LceRelay::last_error() const {
  std::lock_guard<std::mutex> lock(error_mutex_);
  return last_error_;
}

bool LceRelay::active() const {
  return active_.load() > 0;
}

bool LceRelay::host_running() const {
  return host_running_.load() > 0;
}

bool LceRelay::join_listening() const {
  return join_listening_.load() > 0;
}

void LceRelay::start_host(const std::string &auth_token,
                          std::uint16_t game_port) {
  stop_all();
  stopping_.store(false);
  host_running_.store(1);
  active_.store(1);
  workers_.emplace_back([this, token = auth_token, port = game_port] {
    run_host(token, port);
  });
}

bool LceRelay::start_join(const std::string &auth_token,
                          const std::string &target_session,
                          std::string &error) {
  stop_all();
  stopping_.store(false);
  active_.store(1);
  workers_.emplace_back([this, token = auth_token, session = target_session] {
    run_join(token, session);
  });
  const auto deadline = std::chrono::steady_clock::now() +
                        std::chrono::seconds(10);
  while (std::chrono::steady_clock::now() < deadline) {
    if (join_listening_.load()) {
      return true;
    }
    if (!active_.load()) {
      break;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }
  error = last_error();
  return false;
}

void LceRelay::run_host(std::string token, std::uint16_t game_port) {
  std::string error;
  const socket_t host_conn = connect_tcp(kProxyAddr, kProxyPort, error);
  if (host_conn == kInvalidSocket) {
    set_error("Proxy connect failed: " + error);
    host_running_.store(0);
    active_.store(0);
    return;
  }
  track(static_cast<std::intptr_t>(host_conn));
  if (!write_line(host_conn, "HOST " + token + " 0")) {
    set_error("Proxy handshake failed");
    untrack(static_cast<std::intptr_t>(host_conn));
    close_socket(host_conn);
    host_running_.store(0);
    active_.store(0);
    return;
  }
  core::info("lcerelay: host registered with proxy");
  socket_t game_stream = kInvalidSocket;
  const auto deadline = std::chrono::steady_clock::now() +
                        std::chrono::seconds(30);
  while (std::chrono::steady_clock::now() < deadline) {
    if (stopping_.load()) {
      untrack(static_cast<std::intptr_t>(host_conn));
      close_socket(host_conn);
      host_running_.store(0);
      active_.store(0);
      return;
    }
    game_stream = connect_tcp("127.0.0.1", game_port, error);
    if (game_stream != kInvalidSocket) {
      break;
    }
    std::this_thread::sleep_for(std::chrono::seconds(1));
  }
  if (game_stream == kInvalidSocket) {
    set_error("Timed out waiting for game to start");
    untrack(static_cast<std::intptr_t>(host_conn));
    close_socket(host_conn);
    host_running_.store(0);
    active_.store(0);
    return;
  }
  track(static_cast<std::intptr_t>(game_stream));
  core::info("lcerelay: game server connected on port " +
             std::to_string(game_port));
  std::string client_line;
  if (!read_line(host_conn, client_line)) {
    set_error("Proxy closed before client joined");
    untrack(static_cast<std::intptr_t>(host_conn));
    untrack(static_cast<std::intptr_t>(game_stream));
    close_socket(host_conn);
    close_socket(game_stream);
    host_running_.store(0);
    active_.store(0);
    return;
  }
  const std::size_t space = client_line.find(' ');
  const std::string verb =
      space == std::string::npos ? client_line : client_line.substr(0, space);
  const std::string joiner_id =
      space == std::string::npos ? std::string() : client_line.substr(space + 1);
  if (verb != "CLIENT" || joiner_id.empty()) {
    set_error("Expected CLIENT, got: " + client_line);
    untrack(static_cast<std::intptr_t>(host_conn));
    untrack(static_cast<std::intptr_t>(game_stream));
    close_socket(host_conn);
    close_socket(game_stream);
    host_running_.store(0);
    active_.store(0);
    return;
  }
  const socket_t accept_conn = connect_tcp(kProxyAddr, kProxyPort, error);
  if (accept_conn == kInvalidSocket) {
    set_error("Proxy connect failed: " + error);
    untrack(static_cast<std::intptr_t>(host_conn));
    untrack(static_cast<std::intptr_t>(game_stream));
    close_socket(host_conn);
    close_socket(game_stream);
    host_running_.store(0);
    active_.store(0);
    return;
  }
  track(static_cast<std::intptr_t>(accept_conn));
  write_line(accept_conn, "ACCEPT " + token + " 0 " + joiner_id);
  core::info("lcerelay: client joined (" + joiner_id + "), relaying game <-> proxy");
  copy_bidirectional(game_stream, accept_conn);
  untrack(static_cast<std::intptr_t>(host_conn));
  untrack(static_cast<std::intptr_t>(game_stream));
  untrack(static_cast<std::intptr_t>(accept_conn));
  close_socket(host_conn);
  close_socket(game_stream);
  close_socket(accept_conn);
  host_running_.store(0);
  active_.store(0);
}

void LceRelay::run_join(std::string token, std::string session) {
  std::string error;
  const socket_t stream = connect_tcp(kProxyAddr, kProxyPort, error);
  if (stream == kInvalidSocket) {
    set_error("Proxy connect failed: " + error);
    active_.store(0);
    return;
  }
  track(static_cast<std::intptr_t>(stream));
  if (!write_line(stream, "JOIN " + token + " 0 " + session)) {
    set_error("Proxy handshake failed");
    untrack(static_cast<std::intptr_t>(stream));
    close_socket(stream);
    active_.store(0);
    return;
  }
  core::info("lcerelay: join request sent to proxy");
  const socket_t listener = bind_listen(kJoinPort, error);
  if (listener == kInvalidSocket) {
    set_error(error);
    untrack(static_cast<std::intptr_t>(stream));
    close_socket(stream);
    active_.store(0);
    return;
  }
  track(static_cast<std::intptr_t>(listener));
  join_listening_.store(1);
  const socket_t local_stream = ::accept(listener, nullptr, nullptr);
  join_listening_.store(0);
  if (local_stream == kInvalidSocket) {
    set_error("Relay accept failed");
    untrack(static_cast<std::intptr_t>(stream));
    untrack(static_cast<std::intptr_t>(listener));
    close_socket(stream);
    close_socket(listener);
    active_.store(0);
    return;
  }
  track(static_cast<std::intptr_t>(local_stream));
  core::info("lcerelay: game connected locally, relaying game <-> proxy");
  copy_bidirectional(local_stream, stream);
  untrack(static_cast<std::intptr_t>(stream));
  untrack(static_cast<std::intptr_t>(listener));
  untrack(static_cast<std::intptr_t>(local_stream));
  close_socket(stream);
  close_socket(listener);
  close_socket(local_stream);
  active_.store(0);
}

void LceRelay::stop_all() {
  stopping_.store(true);
  {
    std::lock_guard<std::mutex> lock(sockets_mutex_);
    for (const std::intptr_t handle : sockets_) {
      close_socket(static_cast<socket_t>(handle));
    }
    sockets_.clear();
  }
  for (std::thread &worker : workers_) {
    if (worker.joinable()) {
      worker.join();
    }
  }
  workers_.clear();
  host_running_.store(0);
  join_listening_.store(0);
  active_.store(0);
}
} // namespace emerald::lce
