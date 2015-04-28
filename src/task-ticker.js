(function (exports) {

    function onValue (ticker, task, value) {
        if (task.fulfilled) return;

        task.fulfilled = true;
        task.timeout && TaskTicker.clearTimeout(task.timeout);
        task.timeout = null;
        task.resolve(value);
        return value;
    }

    function onError (ticker, task, error) {
        if (task.fulfilled) return;

        if (task.retry >= ticker.retries) {
            task.fulfilled = true;
            task.timeout && TaskTicker.clearTimeout(task.timeout);
            task.timeout = null;
            task.reject(error);
        } else {
            task.retry++;
            TaskTicker.setTimeout(
                push.bind(null, ticker, task, false),
                ticker.backoff(task.retry) * 1000
            );
        }
    }

    function process (ticker, task, expired) {
        if (task.fulfilled) return;

        if (expired) {
            task.fulfilled = true;
            task.reject(expired);
            return;
        }

        try {
            var result = task.callback(Date.now() - task.created);

            // Apply logic to promises too
            if (result && typeof result === 'object' && typeof result.then === 'function') {
                result.then(
                    onValue.bind(null, ticker, task),
                    onError.bind(null, ticker, task)
                );
                return;
            }
            onValue(ticker, task, result);
        } catch (e) {
            onError(ticker, task, e);
        }
    }

    function push (ticker, task) {
        ticker.tasks.push(task);
        tick(ticker);
    }

    function tick (ticker) {
        if (ticker.paused || !ticker.tasks.length) return;

        var now = Date.now(),
            diff = now - ticker.timestamp,
            min = ticker.interval * 1000;

        if (diff < min) {
            TaskTicker.setTimeout(
                tick.bind(null, ticker),
                min - diff
            );
            return;
        }

        var task = ticker.tasks.shift();
        process(ticker, task);

        ticker.timestamp = now;
        tick(ticker);
    }

    function timeout (ticker, task) {
        if (!ticker.timeout) return;
        task.timeout = TaskTicker.setTimeout(function () {
            var idx = ticker.tasks.indexOf(task);
            if (-1 !== idx) {
                ticker.tasks.splice(idx, 1);
            }
            process(ticker, task, TaskTicker.EXPIRED_ERROR);
        }, ticker.timeout * 1000);
    }


    function TaskTicker (interval_or_opts) {

        if (!(this instanceof TaskTicker)) {
            return new TaskTicker(interval_or_opts);
        }

        var opts = typeof interval_or_opts !== 'object'
                 ? { interval: interval_or_opts }
                 : interval_or_opts;

        this.paused = 0;
        this.interval = opts.interval === 0 ? 0 : opts.interval || 0.016;
        this.timeout = opts.timeout || null;
        this.retries = opts.retries || 0,
        this.backoff = typeof opts.backoff === 'function'
                     ? opts.backoff
                     : function (n) {
                        if (opts.backoff === 0) return 0;
                        return ((opts.backoff || 2) << n) * (this.interval || 0.010)
                     }.bind(this);

        this.tasks = [];
        this.timestamp = 0;
    }
    TaskTicker.prototype = Object.create(null);
    TaskTicker.prototype.constructor = TaskTicker;

    TaskTicker.prototype.queue = function (cb) {
        var ticker = this;
        return new TaskTicker.Promise(function (resolve, reject) {
            var task = {
                resolve: resolve,
                reject: reject,

                fulfilled: false,
                timeout: null,
                created: Date.now(),
                retry: 0,
                callback: typeof cb === 'function' ? cb : function () { return cb; }
            };

            timeout(ticker, task);
            push(ticker, task);
        });
    };

    TaskTicker.prototype.pause = function () {
        this.paused = true;
    };

    TaskTicker.prototype.resume = function () {
        this.paused = false;
        tick(this);
    };

    TaskTicker.prototype.reset = function () {
        var task;
        while (this.tasks.length) {
            task = this.tasks.shift();
            process(this, task, TaskTicker.RESET_ERROR);
        }
    };


    TaskTicker.Error = function (msg) { this.message = '' + msg; };
    TaskTicker.Error.prototype = Object.create(Error.prototype);
    TaskTicker.Error.prototype.constructor = TaskTicker.Error;

    TaskTicker.EXPIRED_ERROR = new TaskTicker.Error('Timeout');
    TaskTicker.RESET_ERROR = new TaskTicker.Error('Reset');

    TaskTicker.Promise = typeof Promise !== 'undefined' ? Promise : null;

    // Allow global override for the timing function
    TaskTicker.setTimeout = setTimeout;
    TaskTicker.clearTimeout = clearTimeout;

    // Support node env (avoid native Promise impl. on Node 0.12)
    if (typeof exports !== 'undefined' && this.exports !== exports) {
        TaskTicker.Promise = require('promise-es6').Promise;
    }


    exports.TaskTicker = TaskTicker;

})(this);
