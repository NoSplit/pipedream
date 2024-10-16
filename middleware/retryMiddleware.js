/**
 * Middleware to handle retry logic with exponential backoff and logging.
 *
 * @param {number} maxRetries - The maximum number of retry attempts allowed.
 * @param {number} initialDelay - The initial delay between retries in milliseconds.
 * @param {number} backoffFactor - The factor by which the delay is multiplied after each retry (for exponential backoff).
 *
 * @example
 * const result = await taskprod(func1, func2, func3)(arg, {
 *     initialContext: { someKey: 'someValue' },
 *     middleware: [retryMiddleware(3, 1000, 2)]  // 3 retries, starting with a 1-second delay, doubling the delay after each failure
 * });
 */
const retryMiddleware = (maxRetries = 3, initialDelay = 1000, backoffFactor = 2) => {
    return async (result, context) => {
        // If the method has already succeeded (result is not an error), skip retry logic
        if (context.success) {
            return [result, context];  // No retries needed if the method already succeeded
        }

        let attempt = 1;  // Start from the second attempt since the first one failed
        let success = false;
        let lastError;
        let delay = initialDelay;

        // Retry loop with exponential backoff
        while (attempt <= maxRetries && !success) {
            try {
                console.log(`Retry attempt ${attempt}: Retrying method ${context.method.name}`);

                // Attempt to run the current method
                result = await context.method(result, context);

                // If we reach here, the method succeeded
                console.log(`Retry attempt ${attempt}: Success for method ${context.method.name}`);
                success = true;
                context.success = true;  // Mark the context as successful

            } catch (error) {
                lastError = error;
                console.log(`Retry attempt ${attempt}: Failed with error: ${error.message}`);

                // Apply exponential backoff if more retries are allowed
                if (attempt < maxRetries) {
                    console.log(`Retrying after ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));  // Wait before retrying
                    delay *= backoffFactor;  // Increase delay exponentially
                }
            }

            attempt++;
        }

        // If all attempts failed, throw the last error
        if (!success) {
            console.error(`All retry attempts failed for method ${context.method.name}. Final error: ${lastError.message}`);
            throw lastError;
        }

        return [result, context];
    };
};


if(require.main === module) {
    const { test, describe, it, beforeEach } = require("node:test");
    const assert = require("assert");
    const { taskprod } = require("../taskprod");

    describe('retryMiddleware', () => {
      let fakeMethod;
      let context;
      let result;

      beforeEach(() => {
        // Reset context and result before each test
        result = "initialResult";
        context = {
          method: fakeMethod
        };
      });

      it('should successfully call the method once without retries if no error occurs', async () => {
        fakeMethod = async (res, ctx) => {
          return res;
        };

        const middleware = retryMiddleware(3, 10, 2);
        const [finalResult, finalContext] = await middleware(result, { ...context, method: fakeMethod });

        assert.strictEqual(finalResult, result);
        assert.deepStrictEqual(finalContext, {...context, method: fakeMethod, success: true});
      });

      it('should retry the method and succeed on the second attempt', async () => {
        let attempt = 0;
        fakeMethod = async (res, ctx) => {
          attempt++;
          if (attempt < 2) {
            throw new Error('Temporary Error');
          }
          return res;
        };

        const middleware = retryMiddleware(3, 10, 2);
        const [finalResult, finalContext] = await middleware(result, { ...context, method: fakeMethod });

        assert.strictEqual(attempt, 2);  // Should have retried once
        assert.strictEqual(finalResult, result);
        assert.deepStrictEqual(finalContext, { ...context, method: fakeMethod, success: true});
      });

      it('should fail after maximum retries', async () => {
        fakeMethod = async () => {
          throw new Error('Permanent Error');
        };

        const middleware = retryMiddleware(3, 10, 2);

        try {
          await middleware(result, { ...context, method: fakeMethod });
          assert.fail('Expected middleware to throw an error');
        } catch (error) {
          assert.strictEqual(error.message, 'Permanent Error');
        }
      });

      it('should apply exponential backoff between retries', async () => {
        let attempt = 0;
        const delays = [];

        fakeMethod = async () => {
          attempt++;
          if (attempt <= 3) {
            throw new Error('Temporary Error');
          }
          return [result, context];
        };

        // Mock the setTimeout to track delays without actually delaying the test
        const originalSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => {
          delays.push(delay);
          return originalSetTimeout(fn, 0); // Call immediately for test speed
        };

        const middleware = retryMiddleware(3, 10, 2);

        try {
          await middleware(result, { ...context, method: fakeMethod });
        } catch (error) {
          // This block should not be hit because the test should pass on 4th attempt
        }

        global.setTimeout = originalSetTimeout; // Restore setTimeout

        assert.deepStrictEqual(delays, [10, 20]); // Verifies exponential backoff
      });
    });
    describe('retryMiddleware integration with taskprod', () => {
      // Test 1: Successful execution without retries
      it('should execute the method successfully without retries', async () => {
        const fakeMethod = async (arg, context) => {
          let res = arg + 1;
            return res;
        };

        const pipeline = taskprod(fakeMethod);

        const [result, context] = await pipeline(1, {
          middleware: [retryMiddleware(3, 10, 2)], // Retry middleware with 3 retries
        });

        assert.strictEqual(result, 2); // The method adds 1, so result should be 2
      });

      // Test 2: Retry once and succeed
      it('should retry the method once and succeed', async () => {
        let attempt = 0;
        const fakeMethod = async (arg, context) => {
          attempt++;
          if (attempt < 2) {
            throw new Error('Temporary Error');
          }
          return arg + 1;
        };

        const pipeline = taskprod(fakeMethod);

        const [result, context] = await pipeline(1, {
          middleware: [retryMiddleware(3, 10, 2)], // Retry middleware with 3 retries
        });

        assert.strictEqual(attempt, 2); // Should retry once
        assert.strictEqual(result, 2);  // The method adds 1, so result should be 2
      });

      // Test 3: Exceed retry limit and fail
      it('should fail after exceeding the retry limit', async () => {
        const fakeMethod = async (arg, context) => {
          throw new Error('Permanent Error');
        };

        const pipeline = taskprod(fakeMethod);

        try {
          await pipeline(1, {
            middleware: [retryMiddleware(3, 10, 2)], // Retry middleware with 3 retries
          });
          assert.fail('Expected the pipeline to throw an error after retries');
        } catch (error) {
          assert.strictEqual(error.message, 'Permanent Error');
        }
      });

      // Test 4: Verify exponential backoff with retries
      it('should retry with exponential backoff delays', async () => {
        let attempt = 0;
        const delays = [];
        const fakeMethod = async (arg, context) => {
          attempt++;
          if (attempt <= 3) {
            throw new Error('Temporary Error');
          }
          return arg + 1;
        };

        // Mock setTimeout to track delays instead of waiting in real-time
        const originalSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => {
          delays.push(delay);
          fn(); // Call the function immediately
        };

        const pipeline = taskprod(fakeMethod);

        await pipeline(1, {
          middleware: [retryMiddleware(3, 10, 2)], // Retry middleware with 3 retries
        });

        // Restore the original setTimeout function
        global.setTimeout = originalSetTimeout;

        // Verify that the delays are exponential
        assert.deepStrictEqual(delays, [10, 20]); // 1s, 2s, and 4s backoff
      });
    });
}

module.exports = {
    retryMiddleware
};