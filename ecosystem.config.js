module.exports = {
  apps: [
    {
      name: 'ptm-backend',
      cwd: './backend',
      script: 'src/index.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
      },
    },
  ],
};
