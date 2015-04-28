describe('TaskTicker', function () {
    var sinon = require('sinon');
    var should = require('chai').should();

    // Reduce mocha's default timeout
    this.timeout(5000);


    var TaskTicker = require('../').TaskTicker;

    var Promise = require('promise-es6').Promise;


    var clock, spy;
    beforeEach(function () {
        clock = sinon.useFakeTimers(Date.now());
        // Override the TaskTicker timer with the Sinon mocked ones
        sinon.stub(TaskTicker, 'setTimeout', setTimeout);
        sinon.stub(TaskTicker, 'clearTimeout', clearTimeout);

        spy = sinon.spy();
    });

    afterEach(function () {
        clock.restore();
        TaskTicker.setTimeout.restore();
        TaskTicker.clearTimeout.restore();
    });

    describe('Simple', function () {

        var tt;
        beforeEach(function () {
            tt = TaskTicker(0.1);
        });

        it('should execute first task immediately', function () {
            tt.queue(spy);
            spy.callCount.should.equal(1);
        });

        it('should wait to execute second task', function () {
            tt.queue(spy);
            tt.queue(spy);

            spy.callCount.should.equal(1);
            clock.tick(50);
            spy.callCount.should.equal(1);
            clock.tick(50);
            spy.callCount.should.equal(2);
        });

        it('should execute second immediately if interval passed by', function (){
            tt.queue(spy);
            spy.callCount.should.equal(1);
            clock.tick(200);
            tt.queue(spy);
            spy.callCount.should.equal(2);
        });

        it('should provide elapsed time', function (done) {
            tt.queue(spy);
            tt.queue(function (elapsed) {
                elapsed.should.be.above(100 - 1);
                done();
            });
            clock.tick(100);
            clock.restore();
        });

        it('should resolve promise', function (done) {
            tt.queue('foo')
            .then(function (x) {
                x.should.equal('foo');
                done();
            });
            clock.tick();
            clock.restore();
        });

        it('should reject promise', function (done) {
            tt.queue(function () {
                throw new Error('foo');
            })
            .catch(function (err) {
                err.message.should.equal('foo');
                done();
            })
            clock.tick();
            clock.restore();
        });

        it('should not defer when interval=0', function () {
            tt = TaskTicker(0);
            tt.queue(spy);
            tt.queue(spy);
            spy.callCount.should.equal(2);
        });

        it('should pause', function () {
            tt.queue(spy);
            tt.queue(spy);
            tt.queue(spy);

            spy.callCount.should.equal(1);

            tt.pause();

            clock.tick(1000);
            spy.callCount.should.equal(1);

            tt.resume();
            spy.callCount.should.equal(2);

            clock.tick(100);
            spy.callCount.should.equal(3);
        });

    });

    describe('Promise', function () {

        var tt;
        beforeEach(function () {
            tt = TaskTicker(0.1);
        });

        it('should wait for promise resolution', function (done) {
            tt.queue(function () {
                return new Promise(function (resolve, reject) {
                    setTimeout(resolve.bind(null, 'foo'), 1000);
                });
            })
            .then(function (data) {
                spy();
                data.should.equal('foo');
                done();
            });

            spy.callCount.should.equal(0);
            clock.tick(200);
            spy.callCount.should.equal(0);
            clock.tick(1000);
            spy.callCount.should.equal(1);

            clock.restore();
        });

        it('should wait for promise rejection', function (done) {
            tt.queue(function () {
                return new Promise(function (resolve, reject) {
                    setTimeout(reject.bind(null, Error('foo')), 1000);
                });
            })
            .catch(function (error) {
                spy();
                error.message.should.equal('foo');
                done();
            });

            spy.callCount.should.equal(0);
            clock.tick(200);
            spy.callCount.should.equal(0);
            clock.tick(1000);
            spy.callCount.should.equal(1);

            clock.restore();
        });
    });


    describe('Timeout', function () {
        var tt;
        beforeEach(function () {
            tt = TaskTicker({
                interval: 0.1,
                timeout: 0.20
            });
        });

        it('should reject with a timeout', function (done) {
            tt.queue(spy);
            tt.queue(spy);

            tt.queue(spy)
            .catch(function (err) {
                err.should.be.instanceof(TaskTicker.Error);
                done();
            });

            clock.tick(200);
            clock.restore();

            spy.callCount.should.equal(2);
        });

        it('should reject with a timeout waiting for promise', function (done) {
            tt.queue(function () {
                return new Promise(function (resolve, reject) {
                    setTimeout(resolve.bind(null, 'foo'), 250);
                });
            })
            .catch(function (err) {
                err.should.be.instanceof(TaskTicker.Error);
                done();
            });

            clock.tick(200);
            clock.restore();
        })
    });

    describe('Retries', function () {
        var tt;
        beforeEach(function () {
            tt = TaskTicker({
                interval: 0.1,
                retries: 2,
                backoff: 0,
                timeout: 2.0
            });
        });

        it('should retry upto a maximum', function (done) {
            tt.queue(function () {
                spy();
                throw new Error('foo');
            })
            .catch(function (err) {
                err.message.should.equal('foo');
                done();
            });

            clock.tick(500);
            spy.callCount.should.equal(3);
        });

        it('should resolve after retry', function (done) {
            tt.queue(function () {
                spy();
                if (spy.callCount == 2) return 'foo';
                throw new Error('foo');
            })
            .then(function (data) {
                data.should.equal('foo');
                done();
            });

            clock.tick(500);
            spy.callCount.should.equal(2);
        });

    });

});
