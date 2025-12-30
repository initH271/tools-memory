# Docker 镜像加速配置指南

## 问题：无法连接到 Docker Hub

如果遇到 `TLS handshake timeout` 错误，需要配置 Docker 镜像加速器。

## 解决方案

### Linux 系统

1. 创建或编辑 Docker 配置文件：

```bash
sudo mkdir -p /etc/docker
sudo nano /etc/docker/daemon.json
```

2. 添加以下内容（使用国内镜像源）：

```json
{
  "registry-mirrors": [
    "https://docker.1panel.live",
    "https://hub.rat.dev",
    "https://docker.chenby.cn",
    "https://docker.m.daocloud.io"
  ]
}
```

3. 重启 Docker 服务：

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

4. 验证配置：

```bash
docker info | grep "Registry Mirrors" -A 5
```

### WSL2 (Windows Subsystem for Linux)

在 WSL2 中，可以通过 Docker Desktop 配置：

1. 打开 Docker Desktop
2. 进入 Settings -> Docker Engine
3. 在 JSON 配置中添加镜像加速器
4. 点击 "Apply & Restart"

或者在 WSL2 内部按照 Linux 的方法配置。

### 配置完成后重新构建

```bash
# 重新构建镜像
docker compose build --no-cache

# 启动服务
docker compose up -d
```

## 备选方案：使用代理

如果有 HTTP 代理，可以配置 Docker 使用代理：

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo nano /etc/systemd/system/docker.service.d/http-proxy.conf
```

添加内容：

```ini
[Service]
Environment="HTTP_PROXY=http://proxy.example.com:8080"
Environment="HTTPS_PROXY=http://proxy.example.com:8080"
Environment="NO_PROXY=localhost,127.0.0.1"
```

然后重启 Docker：

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```
