export default {
  socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  
  // Network configuration
  network: {
    prefix: 'sanctum-',
    driver: 'bridge',
  },
  
  // Container naming convention
  containers: {
    prefix: 'sanctum-',
    types: {
      nginx: 'nginx',
      php: 'php',
      mysql: 'mysql',
      redis: 'redis',
      mailhog: 'mailhog',
    },
  },
  
  // Volume naming convention
  volumes: {
    prefix: 'sanctum-',
  },
  
  // Default images
  images: {
    nginx: 'nginx:alpine',
    php: {
      '7.4': 'wordpress:php7.4-fpm',
      '8.0': 'wordpress:php8.0-fpm',
      '8.1': 'wordpress:php8.1-fpm',
      '8.2': 'wordpress:php8.2-fpm',
      '8.3': 'wordpress:php8.3-fpm',
    },
    mysql: {
      '5.7': 'mysql:5.7',
      '8.0': 'mysql:8.0',
      '8.3': 'mysql:8.3',
    },
    redis: 'redis:alpine',
    mailhog: 'mailhog/mailhog:latest',
  },
  
  // Port allocation
  ports: {
    // Dynamic port allocation will be handled by Docker
    http: 80,
    https: 443,
    mailhog: 8025,
  },
  
  // Restart policies
  restartPolicy: {
    name: 'unless-stopped',
  },
  
  // Resource limits
  resources: {
    memory: {
      nginx: '256m',
      php: '512m',
      mysql: '1g',
      redis: '256m',
      mailhog: '128m',
    },
  },
};