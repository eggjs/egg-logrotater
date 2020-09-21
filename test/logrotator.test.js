'use strict';

const util = require('util');
const path = require('path');
const mm = require('egg-mock');
const fs = require('fs');
const glob = require('glob');
const moment = require('moment');
const assert = require('assert');


describe('test/logrotator.test.js', () => {
  afterEach(mm.restore);

  describe('rotate_by_day', () => {

    let app;
    beforeEach(() => {
      app = mm.app({
        baseDir: 'logrotator-app',
        cache: false,
      });
      return app.ready();
    });
    afterEach(() => app.close());
    afterEach(mm.restore);

    const schedule = path.join(__dirname, '../app/schedule/rotate_by_file');
    const now = moment().startOf('date');

    it('should export app.LogRotator', function() {
      assert(app.LogRotator === require('../app/lib/rotator'));
    });

    it('should export agent.LogRotator', function() {
      assert(app.agent.LogRotator === require('../app/lib/rotator'));
    });

    it('should throw when not implement getRotateFiles', function* () {
      const LogRotator = app.LogRotator;
      try {
        yield new LogRotator({ app }).rotate();
        throw new Error('should not throw');
      } catch (err) {
        assert(/not implement/.test(err.message));
      }
    });

    it('should rotate log file default', function* () {
      const msg = [];
      mm(app.coreLogger, 'info', function() {
        msg.push(util.format.apply(null, arguments));
      });
      yield app.runSchedule(schedule);

      const files = glob.sync(path.join(app.config.logger.dir, '*.log.*'));
      assert(files.length > 4);
      assert(files.filter(name => name.indexOf('foo.log.') > 0));
      assert(files.filter(name => name.indexOf('relative.log.') > 0));
      files.forEach(file => assert(/log.\d{4}-\d{2}-\d{2}$/.test(file)));

      const logDir = app.config.logger.dir;
      const date = now.clone().subtract(1, 'days').format('YYYY-MM-DD');
      // assert.equal(fs.existsSync(path.join(logDir, `egg-web.log.${date}`)), true);
      // assert.equal(fs.existsSync(path.join(logDir, 'egg-web.log')), false);
      assert.equal(fs.existsSync(path.join(logDir, `egg-agent.log.${date}`)), true);
      // schedule will not reload logger
      assert.equal(fs.existsSync(path.join(logDir, 'egg-agent.log')), false);
      assert.equal(fs.existsSync(path.join(logDir, `logrotator-web.log.${date}`)), true);
      assert.equal(fs.existsSync(path.join(logDir, 'logrotator-web.log')), false);
      assert.equal(fs.existsSync(path.join(logDir, `common-error.log.${date}`)), true);
      assert.equal(fs.existsSync(path.join(logDir, 'common-error.log')), false);

      assert(/rotate files success by DayRotator/.test(msg[1]));

      // run again should work
      yield app.runSchedule(schedule);
    });

    it('should error when rename to existed file', function* () {
      const file1 = path.join(app.config.logger.dir, 'foo1.log');
      const file2 = path.join(app.config.logger.dir,
        `foo1.log.${now.clone().subtract(1, 'days').format('YYYY-MM-DD')}`);
      fs.writeFileSync(file1, 'foo');
      fs.writeFileSync(file2, 'foo');
      let msg = '';
      mm(app.coreLogger, 'error', err => {
        msg = err.message;
      });
      yield app.runSchedule(schedule);
      assert(msg === `[egg-logrotator] rename ${file1}, found exception: targetFile ${file2} exists!!!`);
    });

    it('should error when rename error', function* () {
      const file1 = path.join(app.config.logger.dir, 'foo1.log');
      fs.writeFileSync(file1, 'foo');
      mm(app.coreLogger, 'error', err => {
        assert(/^\[egg-logrotator\] rename .*?, found exception: rename error$/.test(err.message));
      });
      mm(require('mz/fs'), 'rename', function* () {
        throw new Error('rename error');
      });
      yield app.runSchedule(schedule);
    });

    it('should mock unlink file error', function* () {
      mm(require('mz/fs'), 'unlink', function* () {
        throw new Error('mock unlink error');
      });
      fs.writeFileSync(path.join(app.config.logger.dir,
        `foo.log.${now.clone().subtract(33, 'days').format('YYYY-MM-DD')}`), 'foo');
      yield app.runSchedule(schedule);
      assert(fs.existsSync(path.join(app.config.logger.dir,
        `foo.log.${now.clone().subtract(33, 'days').format('YYYY-MM-DD')}`)));
    });

    it('should mock readdir error', function* () {
      mm(require('mz/fs'), 'readdir', function* () {
        throw new Error('mock readdir error');
      });
      fs.writeFileSync(path.join(app.config.logger.dir,
        `foo.log.${now.clone().subtract(33, 'days').format('YYYY-MM-DD')}`), 'foo');
      yield app.runSchedule(schedule);
      assert(fs.existsSync(path.join(app.config.logger.dir,
        `foo.log.${now.clone().subtract(33, 'days').format('YYYY-MM-DD')}`)));
    });

    it('should ignore logPath in filesRotateBySize', function* () {
      yield app.runSchedule(schedule);
      const logDir = app.config.logger.dir;
      const date = now.clone().subtract(1, 'days').format('YYYY-MM-DD');
      assert(fs.existsSync(path.join(logDir, `size.log.${date}`)) === false);
    });

    it('should ignore logPath in filesRotateByHour', function* () {
      yield app.runSchedule(schedule);
      const logDir = app.config.logger.dir;
      const date = now.clone().subtract(1, 'days').format('YYYY-MM-DD');
      assert(fs.existsSync(path.join(logDir, `hour.log.${date}`)) === false);
    });

    it('should not nerror when Map extend', function* () {
      /* eslint-disable */
      Map.prototype.test = function() {
        console.log('test Map extend');
      };
      /* eslint-enable */
      yield app.runSchedule(schedule);
    });
  });

  describe('rotate_by_size', () => {
    let mockfile;
    let app;
    const schedule = path.join(__dirname, '../app/schedule/rotate_by_size');
    before(() => {
      app = mm.app({
        baseDir: 'logrotator-app-size',
      });
      return app.ready();
    });
    before(() => {
      mockfile = path.join(app.config.logger.dir, 'egg-web.log');
    });
    after(() => app.close());
    afterEach(mm.restore);

    it('should rotate by size', function* () {
      fs.writeFileSync(mockfile, 'mock log text');
      yield app.runSchedule(schedule);
      yield sleep(100);
      assert(fs.existsSync(`${mockfile}.1`));
    });

    it('should keep maxFiles file only', function* () {
      fs.writeFileSync(mockfile, 'mock log text');
      // rotate first
      yield app.runSchedule(schedule);
      yield sleep(100);

      // files second
      fs.writeFileSync(mockfile, 'mock log text');
      yield app.runSchedule(schedule);

      yield sleep(100);

      // files third
      fs.writeFileSync(mockfile, 'mock log text');
      yield app.runSchedule(schedule);
      yield sleep(100);
      assert(fs.existsSync(`${mockfile}.1`));
      if (process.platform !== 'win32') {
        // test fail on windows
        assert(fs.existsSync(`${mockfile}.2`));
      }
      assert.equal(fs.existsSync(`${mockfile}.3`), false);
    });

    it('should error when stat error', function* () {
      fs.writeFileSync(mockfile, 'mock log text');
      mm(require('mz/fs'), 'stat', async () => {
        throw new Error('stat error');
      });
      let msg = '';
      mm(app.coreLogger, 'error', err => {
        msg = err.message;
      });
      yield app.runSchedule(schedule);
      assert.equal(msg, '[egg-logrotator] stat error');
    });

    it('should not great than maxFileSize', function* () {
      fs.unlinkSync(`${mockfile}.1`);
      fs.writeFileSync(mockfile, '');
      yield app.runSchedule(schedule);
      assert(fs.existsSync(`${mockfile}.1`) === false);
    });
  });

  describe('reload logger', () => {
    let app;
    const baseDir = path.join(__dirname, 'fixtures/logger-reload');
    before(() => {
      app = mm.cluster({
        baseDir: 'logger-reload',
      });
      return app.ready();
    });
    // logging to files
    before(() => {
      return app.httpRequest()
        .get('/log')
        .expect({
          method: 'GET',
          path: '/log',
        })
        .expect(200);
    });
    // start rotating
    before(() => {
      return app.httpRequest()
        .get('/rotate')
        .expect(200);
    });

    after(() => app.close());

    it('should reload worker loggers', function* () {
      yield sleep(2000);

      const logname = moment().subtract(1, 'days').format('.YYYY-MM-DD');
      const logfile1 = path.join(baseDir, 'logs/logger-reload/logger-reload-web.log');
      const content1 = fs.readFileSync(logfile1, 'utf8');
      assert(content1 === '');

      const logfile2 = path.join(baseDir, `logs/logger-reload/logger-reload-web.log${logname}`);
      const content2 = fs.readFileSync(logfile2, 'utf8');
      assert(/GET \//.test(content2));

      const logfile3 = path.join(baseDir, `logs/logger-reload/egg-agent.log${logname}`);
      const content3 = fs.readFileSync(logfile3, 'utf8');
      assert(/agent warn/.test(content3));

      yield app.httpRequest()
        .get('/log')
        .expect(200);

      // will logging to new file
      const content4 = fs.readFileSync(logfile1, 'utf8');
      assert(/GET \//.test(content4));
    });
  });

  describe('rotate_by_hour', () => {

    let app;
    before(() => {
      app = mm.app({
        baseDir: 'logrotator-app-hour',
        cache: false,
      });
      return app.ready();
    });
    after(() => app.close());
    afterEach(mm.restore);

    const schedule = path.join(__dirname, '../app/schedule/rotate_by_hour');

    it('should rotate log file default', function* () {
      yield app.runSchedule(schedule);

      const logDir = app.config.logger.dir;
      const date = moment().subtract(1, 'hours').format('YYYY-MM-DD-HH');
      assert.equal(fs.existsSync(path.join(logDir, `egg-web.log.${date}`)), true);
      assert.equal(fs.existsSync(path.join(logDir, 'egg-web.log')), false);
    });
  });

  describe('rotate_by_hour, use custom hourDelimiter', () => {
    let app;
    before(() => {
      app = mm.app({
        baseDir: 'logrotator-app-hour-custom_hourdelimiter',
        cache: false,
      });
      return app.ready();
    });
    after(() => app.close());
    afterEach(mm.restore);

    const schedule = path.join(__dirname, '../app/schedule/rotate_by_hour');

    it('should rotate log file default', function* () {
      yield app.runSchedule(schedule);

      const logDir = app.config.logger.dir;
      const date = moment().subtract(1, 'hours').format('YYYY-MM-DD_HH');
      assert.equal(fs.existsSync(path.join(logDir, `egg-web.log.${date}`)), true);
      assert.equal(fs.existsSync(path.join(logDir, 'egg-web.log')), false);
    });
  });

  describe('logrotator default', () => {
    let app;
    before(() => {
      app = mm.app({
        baseDir: 'logrotator-default',
      });
      return app.ready();
    });
    after(() => app.close());
    afterEach(mm.restore);

    it('should disable rotate_by_size', () => {
      const schedule = path.join(__dirname, '../app/schedule/rotate_by_size.js');
      assert(app.schedules[schedule].schedule.disable);
    });

    it('should disable rotate_by_hour', () => {
      const schedule = path.join(__dirname, '../app/schedule/rotate_by_hour.js');
      assert(app.schedules[schedule].schedule.disable);
    });
    it('should default enable rotate_by_day ', () => {
      const schedule = path.join(__dirname, '../app/schedule/rotate_by_file.js');
      assert(!app.schedules[schedule].schedule.disable);
    });
  });

  describe('rotateLogDirs not exist', () => {
    let app;
    before(() => {
      app = mm.app({
        baseDir: 'noexist-rotator-dir',
        cache: false,
      });
      return app.ready();
    });
    after(() => app.close());

    it('should not throw', function* () {
      const logDir = app.config.logger.dir;
      const now = moment().startOf('date');
      const date = now.clone().subtract(1, 'days').format('YYYY-MM-DD');
      const schedule = path.join(__dirname, '../app/schedule/rotate_by_file');
      yield app.runSchedule(schedule);

      const content = fs.readFileSync(path.join(logDir, `common-error.log.${date}`), 'utf8');
      assert.equal(content, '');
    });

  });

  describe('agent logger', () => {
    let app;
    before(() => {
      app = mm.app({
        baseDir: 'logrotator-agent',
        cache: false,
      });
      return app.ready();
    });
    after(() => app.close());

    it('should be rotated', function* () {
      const logDir = app.config.logger.dir;
      const now = moment().startOf('date');
      const date = now.clone().subtract(1, 'days').format('YYYY-MM-DD');
      const schedule = path.join(__dirname, '../app/schedule/rotate_by_file');
      yield app.runSchedule(schedule);

      assert(fs.existsSync(path.join(logDir, `my-agent.log.${date}`)));
    });

  });

  describe('json logger', () => {
    let app;
    before(() => {
      app = mm.app({
        baseDir: 'logrotator-json-format',
        cache: false,
      });
      return app.ready();
    });
    after(() => app.close());

    it('should be rotated by day', function* () {
      const logDir = app.config.logger.dir;
      const now = moment().startOf('date');
      const date = now.clone().subtract(1, 'days').format('YYYY-MM-DD');
      const schedule = path.join(__dirname, '../app/schedule/rotate_by_file');
      yield app.runSchedule(schedule);

      assert(fs.existsSync(path.join(logDir, `day.log.${date}`)));
      assert(fs.existsSync(path.join(logDir, `day.json.log.${date}`)));
    });

    it('should be rotated by hour', function* () {
      const logDir = app.config.logger.dir;
      const date = moment().subtract(1, 'hours').format('YYYY-MM-DD-HH');
      const schedule = path.join(__dirname, '../app/schedule/rotate_by_hour');
      yield app.runSchedule(schedule);

      assert(fs.existsSync(path.join(logDir, `hour.log.${date}`)));
      assert(fs.existsSync(path.join(logDir, `hour.json.log.${date}`)));
    });

    it('should be rotated by size', function* () {
      app.getLogger('sizeLogger').info('size');
      // wait flush
      yield sleep(1000);

      const logDir = app.config.logger.dir;
      const schedule = path.join(__dirname, '../app/schedule/rotate_by_size');
      yield app.runSchedule(schedule);

      assert(fs.existsSync(path.join(logDir, 'size.log.1')));
      assert(fs.existsSync(path.join(logDir, 'size.json.log.1')));
    });
  });

});

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
