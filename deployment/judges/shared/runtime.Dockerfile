# Native ARM build. Bookworm supplies maintained OS/compiler packages.
# Judge0 1.13.1 still requires its legacy Ruby ABI; keep it isolated here.
FROM ruby:2.7.8-slim-bullseye AS ruby
RUN mkdir /legacy-libs && cp /usr/lib/aarch64-linux-gnu/libssl.so.1.1 /usr/lib/aarch64-linux-gnu/libcrypto.so.1.1 /usr/lib/aarch64-linux-gnu/libffi.so.7* /legacy-libs/
FROM node:22.20.0-bookworm-slim
COPY --from=ruby /usr/local /usr/local
COPY --from=ruby /legacy-libs/ /usr/lib/aarch64-linux-gnu/
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libcap-dev libpq-dev git ca-certificates sudo cron \
    python3 openjdk-17-jdk-headless pkg-config unzip locales procps libyaml-0-2 libreadline8 libgmp10 libcrypt1 && \
    rm -rf /var/lib/apt/lists/* && npm install -g typescript@5.7.3 @types/node@22.10.2
RUN userdel node && useradd -m -u 1000 judge0 && useradd -m -u 1001 piston && \
    echo 'judge0 ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/judge0 && \
    chmod 0440 /etc/sudoers.d/judge0
COPY sources/isolate /tmp/isolate
RUN cd /tmp/isolate && make -j1 isolate && make install && rm -rf /tmp/isolate && \
    install -d -m 0755 /run/isolate/locks /var/local/lib/isolate
ENV LANG=C.UTF-8
