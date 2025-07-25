**The Sanctum** is a comprehensive Docker-based WordPress development environment manager for Ubuntu. It's designed to streamline advanced WordPress development workflows with modern JavaScript, testing, caching, and email capabilities. 

**Key Goals:**
- One-click WordPress site creation with custom domains
- Automatic SSL certificate generation (including Google SSO compatibility)
- Docker-based isolation with per-site MySQL and Redis
- Modern JavaScript/SCSS build pipeline with file watching
- Email testing with MailHog integration
- Database management with GUI tools
- Error monitoring and logging
- Theme/plugin library management

**Target User:** WordPress developer transitioning from Local by Flywheel to a more advanced, customizable development environment.

**System Architecture:**
- Host Application: Native Ubuntu Node.js application
- Container Management: Docker & Docker Compose
- Web Interface: Express.js with React frontend
- Database: SQLite for app config, MySQL containers per WordPress site
- File Structure: `~/sanctum/` as primary directory