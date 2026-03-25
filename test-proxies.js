#!/usr/bin/env node

/**
 * Proxy Tester - Tests your proxies against Google to find working ones
 * 
 * Usage: node test-proxies.js [count]
 * Example: node test-proxies.js 10  (test first 10 proxies)
 */

import { chromium } from 'playwright';
import { getAllProxies } from './src/utils/proxyPool.js';

const testCount = parseInt(process.argv[2]) || 5;

async function testProxy(proxyUrl) {
  const startTime = Date.now();
  
  try {
    // Parse proxy URL to extract credentials for Playwright
    let proxyConfig = { server: proxyUrl };
    
    const proxyMatch = proxyUrl.match(/^(https?:\/\/)(?:([^:]+):([^@]+)@)?(.+)$/);
    if (proxyMatch) {
      const [, protocol, username, password, serverHost] = proxyMatch;
      
      // IMPORTANT: Playwright only supports HTTP proxies (not HTTPS)
      proxyConfig = {
        server: `http://${serverHost}`, // Force HTTP protocol
      };
      
      // Add credentials if present
      if (username && password) {
        proxyConfig.username = username;
        proxyConfig.password = password;
      }
    }
    
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      proxy: proxyConfig,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Try to access Google
    await page.goto('https://www.google.com/search?q=test', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Check if we got CAPTCHA
    const pageText = await page.textContent('body');
    const hasCaptcha = pageText.includes('unusual traffic') || 
                       pageText.includes('CAPTCHA') || 
                       pageText.includes('not a robot');

    await browser.close();
    
    const duration = Date.now() - startTime;
    
    return {
      proxy: proxyUrl,
      success: !hasCaptcha,
      duration,
      error: hasCaptcha ? 'CAPTCHA' : null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      proxy: proxyUrl,
      success: false,
      duration,
      error: error.message.includes('Timeout') ? 'Timeout' : 'Connection failed',
    };
  }
}

async function main() {
  const proxies = getAllProxies();
  
  if (proxies.length === 0) {
    console.error('❌ No proxies found in proxies.txt');
    process.exit(1);
  }
  
  console.log(`\n🧪 Testing ${Math.min(testCount, proxies.length)} proxies from your pool...\n`);
  
  const results = {
    working: [],
    captcha: [],
    timeout: [],
    failed: [],
  };
  
  // Test proxies sequentially to avoid overwhelming them
  for (let i = 0; i < Math.min(testCount, proxies.length); i++) {
    const proxy = proxies[i];
    // Mask credentials: http://user:pass@host:port -> http://***:***@host:port
    const maskedProxy = proxy.includes('@') 
      ? proxy.replace(/(:\/\/)([^:]+):([^@]+)@/, '$1***:***@')
      : proxy;
    
    process.stdout.write(`[${i + 1}/${testCount}] Testing ${maskedProxy}... `);
    
    const result = await testProxy(proxy);
    
    if (result.success) {
      console.log(`✅ OK (${result.duration}ms)`);
      results.working.push({ proxy: maskedProxy, duration: result.duration });
    } else if (result.error === 'CAPTCHA') {
      console.log(`🚫 CAPTCHA (blocked)`);
      results.captcha.push(maskedProxy);
    } else if (result.error === 'Timeout') {
      console.log(`⏱️  Timeout (too slow)`);
      results.timeout.push(maskedProxy);
    } else {
      console.log(`❌ Failed (${result.error})`);
      results.failed.push(maskedProxy);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Working:        ${results.working.length}`);
  console.log(`🚫 CAPTCHA:        ${results.captcha.length}`);
  console.log(`⏱️  Timeout:        ${results.timeout.length}`);
  console.log(`❌ Failed:         ${results.failed.length}`);
  console.log('='.repeat(60));
  
  if (results.working.length > 0) {
    console.log('\n✅ Working proxies (fastest first):');
    results.working
      .sort((a, b) => a.duration - b.duration)
      .forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.proxy} (${r.duration}ms)`);
      });
  }
  
  if (results.working.length === 0) {
    console.log('\n⚠️  No working proxies found!');
    console.log('   - All proxies tested are blocked or not responding');
    console.log('   - Your proxy provider may have quality issues');
    console.log('   - Try testing more proxies: node test-proxies.js 20');
    console.log('   - Consider getting residential proxies instead of datacenter IPs');
  } else {
    const successRate = (results.working.length / testCount * 100).toFixed(1);
    console.log(`\n📈 Success rate: ${successRate}%`);
    
    if (successRate < 30) {
      console.log('⚠️  Low success rate - many proxies are blocked/slow');
      console.log('   - Consider getting better quality proxies');
      console.log('   - Residential proxies work better than datacenter IPs');
    }
  }
  
  console.log('\n');
}

main().catch(console.error);
