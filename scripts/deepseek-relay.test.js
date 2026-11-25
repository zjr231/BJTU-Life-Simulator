'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handler, main } = require('./deepseek-relay.js');

test('旧云函数的两个入口都返回停用状态', async () => {
  for (const entry of [handler, main]) {
    const response = await entry({ body: '{}' });
    assert.equal(response.statusCode, 410);
    assert.match(JSON.parse(response.body).error, /停用/);
  }
});
