const test = require("node:test");
const assert = require("assert");

/**
 * Executes a series of asynchronous functions in sequence, passing the result of each function
 * to the next function along with a shared context object. The context stores and tracks information
 * and provides helper methods to access previous results.
 *
 * @param {...Function} methods - A variable number of async functions to execute in sequence.
 * Each function is called with two arguments: the result of the previous function (or initial argument)
 * and a shared context object.
 *
 * @returns {Function} A function that takes an initial argument and an options object. This returned function
 * runs the pipeline of methods, updating the context with each function's result, and finally returns the
 * latest result and the updated context.
 *
 * The options object contains:
 * @param {any} arg - The initial argument passed to the first function in the pipeline.
 * @param {Object} [options] - Optional configuration object.
 * @param {Object} [options.initialContext={}] - Initial context data to be passed along the pipeline.
 * @param {Array} [options.middleware=[]] - Array of middleware functions to process after each method.
 * Middleware functions receive the current result and context as arguments.
 *
 * The shared context object contains:
 * - initialArgument: The original argument passed into the pipeline.
 * - current: The current result being passed between functions.
 * - method: The name of the current method being processed.
 * - argResults: An array storing the results of each function call in order.
 * - previous(stepsBack): A function to retrieve the result from `stepsBack` steps earlier in the pipeline.
 *   Defaults to the immediate previous result if no argument is passed.
 * - first(stepsForward): A function to retrieve the result from `stepsForward` steps forward in the pipeline,
 *   starting from the initial argument. Defaults to the initial argument if no argument is passed.
 * - initial(): A function to return the initial argument passed to the pipeline.
 *
 * @example
 * const result = await pipeDream(func1, func2, func3)(arg, {
 *   initialContext: { someKey: 'someValue' },
 *   middleware: [middleware1, middleware2]
 * });
 */

const processMiddleware = async (middlewares, result, context) => {
    if (!middlewares || middlewares.length === 0) return result;

    // Loop through all the middleware functions using a standard pipe pattern
    for (let i = 0; i < middlewares.length; i++) {
        const middleware = middlewares[i];
        [mwResult, mwContext] = await middleware(result, context);

        // Update the result and context only if the middleware returned modified values
        if (typeof mwResult !== "undefined") result = mwResult;
        if (typeof mwContext !== "undefined") context = mwContext;
    }
    return [result, context];
}

/**
 * A middleware function that adds a history object to the context. The history object stores a
 * deep clone of the context object at the point when the middleware is invoked, effectively
 * creating a snapshot of the pipeline state at that time.
 *
 * @param {any} result - The current result in the pipeline.
 * @param {Object} context - The current context object in the pipeline.
 *
 * @returns {[any, Object]} - Returns the original result and context, with the added history entry.
 *
 * The history entry is stored in `context.history`, which is an array of previous context objects.
 *
 * @example
 * const result = await historyMiddleware(currentResult, currentContext);
 * console.log(currentContext.history); // Displays an array of cloned context snapshots
 */
const historyMiddleware = (result, context) => {
    // Adds a history object to the context, storing a clone of the previous context object
    context.history = context.history || [];
    context.history.push(JSON.parse(JSON.stringify(context)));

    return [result, context];
}

/**
 * Middleware function that stores the result of each method in the context.results object,
 * using the method's name as the key.
 *
 * @param {any} result - The current result of the method being processed.
 * @param {Object} context - The shared context object, which will be updated with the method's result.
 *
 * @returns {[any, Object]} - Returns the original result and the updated context, with the added result entry.
 *
 * The results are stored in `context.results`, where each key is the method's name and the value is an array
 * of results for that method.
 *
 * @example
 * const result = await functionResultsHistoryMiddleware(currentResult, currentContext);
 * console.log(currentContext.results); // Displays an object with method names as keys and result arrays as values
 */
const functionResultsHistoryMiddleware = (result, context) => {
    context.results = context.results || {};
    let methodName = context.method.name;  // Use the actual method name

    // Store results for each method using its name as the key
    if (!context.results[methodName]) {
        context.results[methodName] = [];
    }
    context.results[methodName].push(result);
    return [result, context];
}

const setResultInContext = (result, context) => {
    context.argResults.push(result);
    context.current = result;
    return result;
}

/**
 * Executes a series of asynchronous functions in sequence, passing the result of each function
 * to the next function along with a shared context object. The context stores and tracks information
 * and provides helper methods to access previous results.
 *
 * @param {...Function} methods - A variable number of async functions to execute in sequence.
 * Each function is called with two arguments: the result of the previous function (or initial argument)
 * and a shared context object.
 *
 * @returns {Function} A function that takes an initial argument and an options object. This returned function
 * runs the pipeline of methods, updating the context with each function's result, and finally returns the
 * latest result and the updated context.
 *
 * The options object contains:
 * @param {any} arg - The initial argument passed to the first function in the pipeline.
 * @param {Object} [options] - Optional configuration object.
 * @param {Object} [options.initialContext={}] - Initial context data to be passed along the pipeline.
 * @param {Array} [options.middleware=[]] - Array of middleware functions to process after each method.
 * Middleware functions receive the current result and context as arguments.
 *
 * The shared context object contains:
 * - initialArgument: The original argument passed into the pipeline.
 * - current: The current result being passed between functions.
 * - method: The current method being processed (as a function reference).
 * - argResults: An array storing the results of each function call in order.
 * - previous(stepsBack): A function to retrieve the result from `stepsBack` steps earlier in the pipeline.
 *   Defaults to the immediate previous result if no argument is passed.
 * - first(stepsForward): A function to retrieve the result from `stepsForward` steps forward in the pipeline,
 *   starting from the initial argument. Defaults to the initial argument if no argument is passed.
 * - initial(): A function to return the initial argument passed to the pipeline.
 *
 * @example
 * const result = await pipeDream(func1, func2, func3)(arg, {
 *   initialContext: { someKey: 'someValue' },
 *   middleware: [middleware1, middleware2]
 * });
 */
const pipeDream = (...methods) => async (arg, {
    initialContext = {},
    middleware = [],
}) => {

    // Clone the initial argument
    let clonedArg = JSON.parse(JSON.stringify(arg));

    // Create a new context object
    let context = {
        initialArgument: arg,
        current: clonedArg,
        method: null,  // This will now store the function reference
        data: initialContext,
        argResults: [],
        success: false,  // Track whether the method succeeded

        /**
         * Returns the result from `argResults` array that was `stepsBack` steps back.
         * Defaults to 1 if no value is provided.
         * @param {number} [stepsBack=1] - The number of steps to look back.
         * @returns {any} - The result from `stepsBack` steps back.
         */
        previous: (stepsBack = 1) => {
            return context.argResults[context.argResults.length - stepsBack];
        },

        /**
         * Returns the result from `argResults` array that is `stepsForward` steps forward.
         * Defaults to 0 (the initial argument) if no value is provided.
         * @param {number} [stepsForward=0] - The number of steps to look forward.
         * @returns {any} - The result from `stepsForward` steps forward.
         */
        first: (stepsForward = 0) => {
            return context.argResults[stepsForward];
        },

        /**
         * Returns the initial argument passed to the pipeline.
         * @returns {any} - The initial argument.
         */
        initial: () => {
            return context.initialArgument;
        }
    };

    // Process each method sequentially
    for (let i = 0; i < methods.length; i++) {
        const method = methods[i];
        context.method = method;  // Store the actual method reference in context

        try {
            // Attempt to run the current method
            const result = await method(clonedArg, context);
            context.success = true;  // Mark as success if method execution succeeded

            // Apply middleware
            await processMiddleware(middleware, result, context);

            clonedArg = setResultInContext(result, context);
        } catch (error) {
            // If method throws an error, pass control to the middleware (like retryMiddleware)
            context.success = false;
            const [result] = await processMiddleware(middleware, clonedArg, context);

            if(context.success) {
                clonedArg = setResultInContext(result, context);
            }
        }
    }

    // Return the final result and updated context
    return [clonedArg, context];
};

// if this script is run directly, run the test function
if (require.main === module) {
    // test the pipeDream function
    // it should pass the context object to each function
    test("It should apply all middleware to the result in sequence", async () => {
        const middlewares = [
            (result, context) => [result + 1, context],
            (result, context) => [result * 2, context],
            (result, context) => [result - 3, context]
        ];

        const initialResult = 5;
        const finalResult = await processMiddleware(middlewares, initialResult, {});

        // should return [9, {}]
        assert.deepStrictEqual(finalResult, [9, {}]);
    });
    test("It should return the final result after applying all middleware", async () => {
        const middlewares = [
            (result, context) => [result * 10, context],
        ];

        const initialResult = 2;
        const finalResult = await processMiddleware(middlewares, initialResult, {});

        assert.deepStrictEqual(finalResult, [20, {}]);
    });
    test("It should correctly process asynchronous methods in the pipe", async () => {
        const methods = [
            async (arg) => arg + 2,
            async (arg) => arg * 3
        ];

        const testPipe = pipeDream(...methods);

        const [result] = await testPipe(5, { initialContext: {} });

        // Final result should be ((5 + 2) * 3) = 21
        assert.strictEqual(result, 21);
    });

    test("It should pass context to middleware functions", async () => {
        const mockMiddleware = (result, context) => {
            context.testKey = "testValue";
            return [result, context];
        };

        const middlewares = [mockMiddleware];
        const initialContext = {};
        const [mwResult, mwContext] = await processMiddleware(middlewares, 5, initialContext);

        assert.strictEqual(mwContext.testKey, "testValue");
    });

    test("It should modify the context’s results object with method results", async () => {
        const methods = [
            async function add(arg) { return arg + 1; },
            async function multiply(arg) { return arg * 2; }
        ];

        const testPipe = pipeDream(...methods);
        const context = { initialContext: {}, middleware: [functionResultsHistoryMiddleware, (result, context) => {
            console.log('log: ', result, context)
                return [result, context];
            }]};

        const [argResult, contextResult] = await testPipe(3, context);

        assert.deepStrictEqual(contextResult.results.add, [4]);
        assert.deepStrictEqual(contextResult.results.multiply, [8]);
    });
    test("It should handle results from multiple calls to the same method", async () => {
        const methods = [
            async function add(arg) { return arg + 1; }, // 3 + 1 = 4
            async function add(arg) { return arg + 2; }  // 4 + 2 = 6
        ];

        const testPipe = pipeDream(...methods);
        const context = { initialContext: {}, middleware: [functionResultsHistoryMiddleware]};

        const [argResult, contextResult] = await testPipe(3, context);

        assert.deepStrictEqual(contextResult.results.add, [4, 6]);

    });
    test("It should handle an empty middleware array without throwing errors", async () => {
        const methods = [
            async (arg) => arg + 1
        ];

        const testPipe = pipeDream(...methods);
        const context = { initialContext: {}, middleware: [] };

        const [result] = await testPipe(5, context);

        assert.strictEqual(result, 6); // Should return 6 after method is applied
    });
    test("It should return the correct previous result when using the previous method", async () => {
        const methods = [
            async (arg) => arg + 1, // 5 + 1 = 6
            async (arg, context) => arg * 2, // 6 * 2 = 12
            async (arg, context) => arg * 3, // 12 * 3 = 36
            async (arg, context) => arg - 5, // 36 - 5 = 31
        ];

        const testPipe = pipeDream(...methods);
        const context = { initialContext: {} };

        const [result, workingContext] = await testPipe(5, context);

        const previousResult = workingContext.previous();
        const previousResult2 = workingContext.previous(2);
        const previousResult3 = workingContext.previous(3);
        const previousResult4 = workingContext.previous(4);

        assert.strictEqual(previousResult, 31);
        assert.strictEqual(previousResult2, 36);
        assert.strictEqual(previousResult3, 12);
        assert.strictEqual(previousResult4, 6);
    });
    test("It should add the context to the history with when historyMiddleware is added", async () => {
        const methods = [
            async (arg) => arg + 1, // 5 + 1 = 6
            async (arg) => arg * 2, // 6 * 2 = 12
            async (arg, context) => arg * context.previous(2), // 12 * 5 = 60
        ];

        const testPipe = pipeDream(...methods);
        const context = { initialContext: {}, middleware: [historyMiddleware] };

        const [result, finalContext] = await testPipe(5, context);

        assert.strictEqual(finalContext.history.length, 3);
        assert.strictEqual(finalContext.history[0].current, 5);
        assert.strictEqual(finalContext.history[1].current, 6);
        assert.strictEqual(finalContext.history[2].current, 12);
    })
}

module.exports = {
    pipeDream,
    processMiddleware,
    historyMiddleware
};