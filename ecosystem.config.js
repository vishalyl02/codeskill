const fs = require('fs');
const path = require('path');

const backendScript = fs.existsSync(path.join(__dirname, 'backend-nestjs/dist/src/main.js')) && !fs.existsSync(path.join(__dirname, 'backend-nestjs/dist/main.js'))
  ? 'dist/src/main.js'
  : 'dist/main.js';

module.exports = {
  apps: [
    {
      name: "codeskill-backend",
      script: backendScript,
      cwd: "./backend-nestjs",
      instances: Number(process.env.API_INSTANCES || 1),
      exec_mode: Number(process.env.API_INSTANCES || 1) > 1 ? "cluster" : "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 5001,
        PROCESS_ROLE: "api",
        JUDGE_CONFIG_PARAMETER: "/codeskill-prod/judges/backend_env",
        ENABLE_EMBEDDED_JUDGE: "false",
      },
      log_date_format: "YYYY-MM-DDTHH:mm:ss.SSSZ",
      error_file: "../logs/backend-error.log",
      out_file: "../logs/backend-out.log",
      merge_logs: true,
    },
    {
      name: "codeskill-worker",
      script: backendScript.replace(/main\.js$/, "worker.js"),
      cwd: "./backend-nestjs",
      instances: Number(process.env.JUDGE_WORKER_INSTANCES || 1),
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PROCESS_ROLE: "judge",
        JUDGE_CONFIG_PARAMETER: "/codeskill-prod/judges/backend_env",
        JUDGE_SANDBOX: "docker",
      },
      log_date_format: "YYYY-MM-DDTHH:mm:ss.SSSZ",
      error_file: "../logs/worker-error.log",
      out_file: "../logs/worker-out.log",
      merge_logs: true,
    },
    {
      name: "codeskill-frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "./frontend-v2",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      log_date_format: "YYYY-MM-DDTHH:mm:ss.SSSZ",
      error_file: "../logs/frontend-error.log",
      out_file: "../logs/frontend-out.log",
      merge_logs: true,
    }
  ]
};
