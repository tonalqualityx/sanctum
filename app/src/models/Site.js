class Site {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.domain = data.domain;
    this.status = data.status || 'stopped';
    this.phpVersion = data.php_version;
    this.description = data.description;
    this.port = data.port;
    this.containers = data.containers || [];
    this.ports = data.ports || [];
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      domain: this.domain,
      status: this.status,
      php_version: this.phpVersion,
      description: this.description,
      port: this.port,
      containers: this.containers,
      ports: this.ports,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }

  static fromDatabase(row) {
    return new Site(row);
  }

  isRunning() {
    return this.status === 'running';
  }

  isStopped() {
    return this.status === 'stopped';
  }

  hasError() {
    return this.status === 'error';
  }

  getMainPort() {
    const mainPort = this.ports.find(p => p.service_type === 'main');
    return mainPort ? mainPort.port : this.port;
  }

  getServicePorts() {
    return this.ports.reduce((acc, port) => {
      acc[port.service_type] = port.port;
      return acc;
    }, {});
  }

  getContainersByType() {
    return this.containers.reduce((acc, container) => {
      if (!acc[container.container_type]) {
        acc[container.container_type] = [];
      }
      acc[container.container_type].push(container.container_id);
      return acc;
    }, {});
  }

  validate() {
    const errors = [];

    if (!this.name || this.name.trim().length === 0) {
      errors.push('Site name is required');
    }

    if (!this.domain || this.domain.trim().length === 0) {
      errors.push('Domain is required');
    }

    if (!['running', 'stopped', 'error', 'provisioning', 'creating'].includes(this.status)) {
      errors.push('Invalid status');
    }

    if (this.phpVersion && !['7.4', '8.0', '8.1', '8.2', '8.3'].includes(this.phpVersion)) {
      errors.push('Invalid PHP version');
    }

    if (this.port && (this.port < 1 || this.port > 65535)) {
      errors.push('Invalid port number');
    }

    return errors;
  }

  isValid() {
    return this.validate().length === 0;
  }
}

export default Site