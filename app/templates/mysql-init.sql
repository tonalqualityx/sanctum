-- MySQL initialization script
-- Ensure proper permissions for WordPress database

GRANT ALL PRIVILEGES ON wordpress.* TO 'wordpress'@'%';
FLUSH PRIVILEGES;