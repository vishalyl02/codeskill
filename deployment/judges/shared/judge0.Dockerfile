FROM codeskill-native-runtime:arm64
ENV GEM_HOME=/opt/.gem
ENV PATH=/opt/.gem/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends zlib1g-dev libxml2-dev libxslt1-dev shared-mime-info libffi-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /api
COPY sources/judge0/Gemfile* ./
RUN gem install bundler -v 2.1.4 --no-document && \
    bundle config set jobs 1 && bundle config set build.nokogiri --use-system-libraries && bundle install --without development test
COPY sources/judge0 .
COPY judge0-seeds.rb db/seeds.rb
COPY judge0-entrypoint.sh /usr/local/bin/codeskill-judge0
RUN rm -f /api/judge0.conf && mkdir -p log tmp && chown -R judge0:judge0 /api /opt/.gem && \
    chmod +x /usr/local/bin/codeskill-judge0 && \
    sed -i 's/export | sudo tee \/api\/environment/export | sudo tee \/api\/environment >\/dev\/null/' scripts/server
ENV RAILS_ENV=production JUDGE0_VERSION=1.13.1
ENTRYPOINT ["/usr/local/bin/codeskill-judge0"]
CMD ["api"]
COPY cgroup-init.sh /usr/local/bin/cgroup-init.sh
