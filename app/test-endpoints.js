#!/usr/bin/env node

import http from 'http';

const BASE_URL = 'http://localhost:3000';

const makeRequest = (method, path, data = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
};

const runTests = async () => {
  console.log('🧪 Testing Sanctum API Endpoints\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await makeRequest('GET', '/api/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Database: ${health.data.services?.database}`);
    console.log(`   Docker: ${health.data.services?.docker}`);
    console.log();

    // Test system endpoint
    console.log('2. Testing system endpoint...');
    const system = await makeRequest('GET', '/api/system');
    console.log(`   Status: ${system.status}`);
    console.log(`   Platform: ${system.data.platform}`);
    console.log(`   Memory: ${Math.round(system.data.memory?.process?.heapUsed / 1024 / 1024)}MB`);
    console.log();

    // Test statistics endpoint
    console.log('3. Testing statistics endpoint...');
    const stats = await makeRequest('GET', '/api/statistics');
    console.log(`   Status: ${stats.status}`);
    console.log(`   Total sites: ${stats.data.sites?.total || 0}`);
    console.log();

    // Test get all sites (should be empty initially)
    console.log('4. Testing get all sites...');
    const allSites = await makeRequest('GET', '/api/sites');
    console.log(`   Status: ${allSites.status}`);
    console.log(`   Sites count: ${allSites.data.sites?.length || 0}`);
    console.log();

    // Test create site
    console.log('5. Testing create site...');
    const newSite = await makeRequest('POST', '/api/sites', {
      name: 'Test Site',
      domain: 'test.local',
      description: 'A test WordPress site',
      phpVersion: '8.1'
    });
    console.log(`   Status: ${newSite.status}`);
    console.log(`   Site ID: ${newSite.data.site?.id}`);
    console.log(`   Domain: ${newSite.data.site?.domain}`);
    console.log(`   Port: ${newSite.data.site?.port}`);
    console.log();

    if (newSite.data.site?.id) {
      const siteId = newSite.data.site.id;

      // Test get specific site
      console.log('6. Testing get specific site...');
      const getSite = await makeRequest('GET', `/api/sites/${siteId}`);
      console.log(`   Status: ${getSite.status}`);
      console.log(`   Site name: ${getSite.data.site?.name}`);
      console.log();

      // Test update site
      console.log('7. Testing update site...');
      const updateSite = await makeRequest('PUT', `/api/sites/${siteId}`, {
        description: 'Updated test site description'
      });
      console.log(`   Status: ${updateSite.status}`);
      console.log(`   Updated description: ${updateSite.data.site?.description}`);
      console.log();

      // Test site settings
      console.log('8. Testing site settings...');
      const updateSettings = await makeRequest('PUT', `/api/sites/${siteId}/settings`, {
        settings: {
          'custom_setting': 'test_value',
          'another_setting': 'another_value'
        }
      });
      console.log(`   Update status: ${updateSettings.status}`);
      
      const getSettings = await makeRequest('GET', `/api/sites/${siteId}/settings`);
      console.log(`   Get status: ${getSettings.status}`);
      console.log(`   Settings: ${JSON.stringify(getSettings.data.settings)}`);
      console.log();

      // Test delete site
      console.log('9. Testing delete site...');
      const deleteSite = await makeRequest('DELETE', `/api/sites/${siteId}`);
      console.log(`   Status: ${deleteSite.status}`);
      console.log(`   Message: ${deleteSite.data.message}`);
      console.log();
    }

    // Test validation errors
    console.log('10. Testing validation errors...');
    const invalidSite = await makeRequest('POST', '/api/sites', {
      name: '', // Invalid - empty name
      domain: 'invalid..domain' // Invalid domain
    });
    console.log(`   Status: ${invalidSite.status}`);
    console.log(`   Errors: ${invalidSite.data.error?.details?.length || 0}`);
    console.log();

    // Test 404 error
    console.log('11. Testing 404 error...');
    const notFound = await makeRequest('GET', '/api/sites/99999');
    console.log(`   Status: ${notFound.status}`);
    console.log(`   Message: ${notFound.data.error?.message}`);
    console.log();

    console.log('✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
};

// Run tests if server is available
const checkServer = async () => {
  try {
    await makeRequest('GET', '/api/health');
    console.log('Server is running, starting tests...\n');
    await runTests();
  } catch (error) {
    console.error('❌ Server is not running. Please start the server with: npm run dev');
    process.exit(1);
  }
};

checkServer();