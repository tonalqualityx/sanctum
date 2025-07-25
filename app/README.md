# Sanctum - WordPress Development Environment Manager

A comprehensive Docker-based WordPress development environment manager for Ubuntu, designed to streamline advanced WordPress development workflows with modern JavaScript, testing, caching, and email capabilities.

## Features

- 🚀 One-click WordPress site creation with custom domains
- 🔒 Automatic SSL certificate generation (self-signed and Let's Encrypt support)
- 🐳 Docker-based isolation with per-site MySQL and Redis containers
- 📦 Modern JavaScript/SCSS build pipeline with file watching
- 📧 Email testing with MailHog integration
- 🗄️ Database management with phpMyAdmin
- 📊 Error monitoring and logging
- 📚 Theme/plugin library management

## Prerequisites

- Ubuntu 20.04 or later
- Node.js 18.0.0 or later
- Docker and Docker Compose
- OpenSSL (for SSL certificate generation)

## Installation

1. Clone the repository:
```bash
cd ~/sanctum/app
```

2. Install dependencies:
```bash
npm install
cd frontend && npm install
```

3. Copy the environment file:
```bash
cp .env.example .env
```

4. Update the `.env` file with your settings:
```bash
nano .env
```

5. Start the application:
```bash
npm run dev
```

## Usage

### Creating a New Site

1. Navigate to http://localhost:3000
2. Click "New Site" in the navigation
3. Enter your domain (e.g., `mysite.local`)
4. Select PHP and MySQL versions
5. Click "Create Site"

### Managing Sites

- **Start/Stop**: Control site containers from the Sites page
- **View Details**: Click on a site to see detailed information
- **Access Services**:
  - WordPress: `https://[domain]`
  - WP Admin: `https://[domain]/wp-admin`
  - phpMyAdmin: Available on dynamic port
  - MailHog: Available on dynamic port

### SSL Certificates

Sanctum automatically generates self-signed SSL certificates for local development. For production domains, Let's Encrypt support is planned.

## Project Structure

```
~/sanctum/
├── app/                    # Main application
│   ├── src/               # Backend source code
│   ├── frontend/          # React frontend
│   ├── templates/         # Docker and config templates
│   └── database/          # SQLite database
├── sites/                 # Individual WordPress sites
├── library/               # Shared themes and plugins
├── ssl/                   # SSL certificates
└── logs/                  # System logs
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/sites` - List all sites
- `POST /api/sites` - Create new site
- `GET /api/sites/:domain` - Get site details
- `POST /api/sites/:domain/start` - Start site
- `POST /api/sites/:domain/stop` - Stop site
- `DELETE /api/sites/:domain` - Delete site

## Development

### Running in Development Mode

```bash
npm run dev
```

This starts both the backend server and frontend development server with hot reloading.

### Building for Production

```bash
npm run build
npm start
```

### Linting and Formatting

```bash
npm run lint
npm run format
```

## Configuration

### Environment Variables

- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Server port (default: 3000)
- `DATABASE_PATH` - SQLite database location
- `SITES_DIRECTORY` - WordPress sites directory
- `SSL_DIRECTORY` - SSL certificates directory
- `DOCKER_SOCKET` - Docker socket path

### Docker Configuration

Edit `config/docker.js` to customize:
- Container naming conventions
- Default images and versions
- Resource limits
- Network settings

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure your user has access to Docker:
```bash
sudo usermod -aG docker $USER
```

2. **Port Conflicts**: Check for services using required ports:
```bash
sudo lsof -i :80
sudo lsof -i :443
```

3. **SSL Certificate Issues**: Regenerate certificates:
```bash
rm -rf ~/sanctum/ssl/[domain]
# Restart the site
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Roadmap

- [ ] Let's Encrypt integration
- [ ] WordPress CLI integration
- [ ] Automated backups
- [ ] Site cloning/staging
- [ ] Performance monitoring
- [ ] Multi-user support
- [ ] Plugin/theme marketplace integration