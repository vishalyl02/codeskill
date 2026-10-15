FROM codeskill-native-runtime:arm64
WORKDIR /piston_api
COPY sources/piston/api/package*.json ./
# Use HTTPS for the two locked Git dependencies; no SSH credentials are needed.
RUN git config --global url.https://github.com/.insteadOf ssh://git@github.com/ && \
    git config --global --add url.https://github.com/.insteadOf git@github.com: && \
    npm ci --omit=dev && npm cache clean --force
COPY sources/piston/api .
COPY piston-packages.py /usr/local/bin/piston-packages.py
COPY cgroup-init.sh piston-entrypoint.sh /usr/local/bin/
RUN python3 /usr/local/bin/piston-packages.py && chmod +x /usr/local/bin/*entrypoint.sh && \
    chown -R piston:piston /piston_api /piston/jobs
ENTRYPOINT ["/usr/local/bin/piston-entrypoint.sh"]
