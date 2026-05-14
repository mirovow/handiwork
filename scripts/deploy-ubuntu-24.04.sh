#!/bin/sh
set -eu

APP_NAME="handiwork"
BACKEND_PORT="${BACKEND_PORT:-3000}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-cross_stitch}"
INSTALL_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKEND_DIR="$INSTALL_DIR/backend"
FRONTEND_DIR="$INSTALL_DIR/frontend"
WEB_ROOT="/var/www/$APP_NAME"
APP_STATE_DIR="/var/lib/$APP_NAME"
UPLOADS_DIR="$APP_STATE_DIR/uploads"
ENV_DIR="/etc/$APP_NAME"
BACKEND_ENV="$ENV_DIR/backend.env"
NGINX_AUTH_FILE="$ENV_DIR/nginx.htpasswd"
BACKEND_SERVICE="/etc/systemd/system/$APP_NAME-backend.service"
NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"
NODE_MAJOR="${NODE_MAJOR:-22}"
MONGODB_MAJOR="${MONGODB_MAJOR:-8.0}"
ENABLE_UFW="${ENABLE_UFW:-1}"
DEPLOY_USER="${SUDO_USER:-$(id -un)}"
BASIC_AUTH_USER="${BASIC_AUTH_USER:-}"
BASIC_AUTH_PASSWORD="${BASIC_AUTH_PASSWORD:-}"

log() {
  printf '%s\n' "==> $*"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    exec sudo -E sh "$0" "$@"
  fi
}

require_repo_layout() {
  if [ ! -f "$BACKEND_DIR/package.json" ] || [ ! -f "$FRONTEND_DIR/package.json" ]; then
    printf '%s\n' "Run this script from the repository that contains backend/ and frontend/." >&2
    exit 1
  fi
}

require_basic_auth_config() {
  if [ -z "$BASIC_AUTH_USER" ] || [ -z "$BASIC_AUTH_PASSWORD" ]; then
    printf '%s\n' "Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD before running deploy." >&2
    printf '%s\n' "Example: BASIC_AUTH_USER=admin BASIC_AUTH_PASSWORD='change-me' sudo -E ./scripts/deploy-ubuntu-24.04.sh" >&2
    exit 1
  fi

  case "$BASIC_AUTH_USER" in
    *:*)
      printf '%s\n' "BASIC_AUTH_USER must not contain ':'." >&2
      exit 1
      ;;
  esac
}

run_as_deploy_user() {
  if [ "$DEPLOY_USER" = "root" ]; then
    sh -c "$1"
  else
    sudo -H -u "$DEPLOY_USER" sh -c "$1"
  fi
}

install_apt_prerequisites() {
  log "Installing apt prerequisites"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    bash \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    nginx \
    apache2-utils \
    ufw \
    iproute2 \
    build-essential \
    python3 \
    make \
    g++
}

install_nodejs() {
  if command -v node >/dev/null 2>&1; then
    NODE_CURRENT_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
    if [ "$NODE_CURRENT_MAJOR" -ge "$NODE_MAJOR" ]; then
      log "Node.js $(node -v) is already installed"
      return
    fi
  fi

  log "Installing Node.js $NODE_MAJOR.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
}

install_mongodb() {
  if command -v mongod >/dev/null 2>&1; then
    log "MongoDB is already installed"
  else
    log "Installing MongoDB $MONGODB_MAJOR"
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL "https://pgp.mongodb.com/server-${MONGODB_MAJOR}.asc" | \
      gpg --dearmor --yes -o "/etc/apt/keyrings/mongodb-server-${MONGODB_MAJOR}.gpg"

    ARCH="$(dpkg --print-architecture)"
    printf '%s\n' "deb [ arch=$ARCH signed-by=/etc/apt/keyrings/mongodb-server-${MONGODB_MAJOR}.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/${MONGODB_MAJOR} multiverse" \
      > "/etc/apt/sources.list.d/mongodb-org-${MONGODB_MAJOR}.list"

    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y mongodb-org
  fi

  log "Restricting MongoDB to localhost"
  if grep -q '^[[:space:]]*bindIp:' /etc/mongod.conf; then
    sed -i 's/^[[:space:]]*bindIp:.*/  bindIp: 127.0.0.1/' /etc/mongod.conf
  else
    sed -i '/^[[:space:]]*net:[[:space:]]*$/a\  bindIp: 127.0.0.1' /etc/mongod.conf
  fi

  systemctl enable mongod
  systemctl restart mongod
}

configure_firewall() {
  log "Configuring firewall"
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null
  ufw deny "$MONGO_PORT/tcp" >/dev/null

  if [ "$ENABLE_UFW" = "1" ]; then
    ufw --force enable >/dev/null
  fi
}

install_node_dependencies() {
  log "Installing backend dependencies"
  run_as_deploy_user "cd '$BACKEND_DIR' && npm ci"

  log "Installing frontend dependencies"
  run_as_deploy_user "cd '$FRONTEND_DIR' && npm ci"
}

build_application() {
  log "Building backend"
  run_as_deploy_user "cd '$BACKEND_DIR' && npm run build"

  log "Building frontend"
  run_as_deploy_user "cd '$FRONTEND_DIR' && VITE_API_URL=/api npm run build"
}

install_backend_service() {
  log "Installing backend systemd service"
  install -d -m 0755 "$ENV_DIR" "$APP_STATE_DIR" "$UPLOADS_DIR"
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_STATE_DIR"

  cat > "$BACKEND_ENV" <<EOF
MONGODB_URI=mongodb://127.0.0.1:$MONGO_PORT/$MONGO_DB
HOST=127.0.0.1
PORT=$BACKEND_PORT
UPLOADS_DIR=$UPLOADS_DIR
MAX_UPLOAD_SIZE_BYTES=10485760
MIN_PATTERN_SIZE=10
MAX_PATTERN_SIZE=500
NODE_ENV=production
EOF
  chmod 0640 "$BACKEND_ENV"

  cat > "$BACKEND_SERVICE" <<EOF
[Unit]
Description=Handiwork NestJS backend
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$BACKEND_DIR
EnvironmentFile=$BACKEND_ENV
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$APP_NAME-backend.service"
  systemctl restart "$APP_NAME-backend.service"
}

install_frontend_site() {
  log "Publishing frontend static files"
  rm -rf "$WEB_ROOT"
  install -d -m 0755 "$WEB_ROOT"
  cp -R "$FRONTEND_DIR/build/." "$WEB_ROOT/"
  chown -R www-data:www-data "$WEB_ROOT"
}

configure_basic_auth() {
  log "Configuring Nginx Basic Auth"
  install -d -m 0750 "$ENV_DIR"
  printf '%s\n' "$BASIC_AUTH_PASSWORD" | htpasswd -B -i -c "$NGINX_AUTH_FILE" "$BASIC_AUTH_USER" >/dev/null
  chown root:www-data "$NGINX_AUTH_FILE"
  chmod 0640 "$NGINX_AUTH_FILE"
}

configure_nginx() {
  log "Configuring Nginx"
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root $WEB_ROOT;
    index index.html;

    client_max_body_size 10m;

    auth_basic "Handiwork";
    auth_basic_user_file $NGINX_AUTH_FILE;

    location = /api {
        return 301 /api/;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  rm -f /etc/nginx/sites-enabled/default
  ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$APP_NAME"
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
}

smoke_check() {
  log "Running smoke checks"
  systemctl is-active --quiet mongod
  systemctl is-active --quiet "$APP_NAME-backend.service"
  systemctl is-active --quiet nginx
  curl -fsS "http://127.0.0.1:$BACKEND_PORT/" >/dev/null
  curl -fsS -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASSWORD" "http://127.0.0.1/" >/dev/null

  if ss -ltn | grep -q "0.0.0.0:$MONGO_PORT"; then
    printf '%s\n' "MongoDB is listening on a public IPv4 interface." >&2
    exit 1
  fi

  if ss -ltn | grep -q "\[::\]:$MONGO_PORT"; then
    printf '%s\n' "MongoDB is listening on a public IPv6 interface." >&2
    exit 1
  fi
}

main() {
  require_root "$@"
  require_repo_layout
  require_basic_auth_config
  install_apt_prerequisites
  install_nodejs
  install_mongodb
  configure_firewall
  install_node_dependencies
  build_application
  install_backend_service
  install_frontend_site
  configure_basic_auth
  configure_nginx
  smoke_check

  log "Deployment complete"
  printf '%s\n' "Frontend: http://SERVER_IP/"
  printf '%s\n' "Backend API: http://SERVER_IP/api/"
  printf '%s\n' "Basic Auth user: $BASIC_AUTH_USER"
  printf '%s\n' "MongoDB: localhost only"
}

main "$@"
