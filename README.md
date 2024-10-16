
# Taskprod: Asynchronous Function Pipeline with Middleware

## Overview

**taskprod** is a powerful JavaScript utility for executing a series of asynchronous functions in sequence, passing the result of each function to the next while maintaining a shared context. This tool allows developers to manage complex workflows, integrate middleware for custom logic, track function results, and handle retries with exponential backoff.

## Features

- **Asynchronous Pipeline**: Executes async functions in sequence.
- **Shared Context**: Track state and results across function calls.
- **Middleware**: Add custom logic between each step.
- **Retry Mechanism**: Built-in retry logic with exponential backoff.
- **Result Tracking**: Log function results and history.

## Installation

Install via npm:

```bash
npm install @taskprod/core
```

## Usage

Create a pipeline of asynchronous functions and add middleware to customize behavior.

```javascript
const { taskprod, retryMiddleware } = require('@taskprod/core');

// Define async functions
async function addTwo(arg, context) {
  return arg + 2;
}

async function multiplyByThree(arg, context) {
  return arg * 3;
}

// Create a pipeline with retry middleware
const result = await taskprod(addTwo, multiplyByThree)(5, {
  initialContext: { exampleKey: 'exampleValue' },
  middleware: [retryMiddleware(3, 1000, 2)],
});

console.log(result);  // Outputs: [21, updatedContext]
```

In this example, the pipeline runs `addTwo` and `multiplyByThree` in sequence, and uses retry middleware to handle failures.

## Middleware Examples

### Retry Middleware

Automatically retries failed methods with exponential backoff:

```javascript
const retry = retryMiddleware(3, 1000, 2);  // 3 retries, starting at 1 second, doubling delay each retry
```

### History Middleware

Store a deep-cloned snapshot of the context at each step:

```javascript
const { historyMiddleware } = require('@taskprod/core');
```

### Function Result Tracking

Track and store the results of each method in the context:

```javascript
const { functionResultsHistoryMiddleware } = require('@taskprod/core');
```

## Testing

Run tests using Node’s built-in testing framework:

```bash
node script.js
```

## License

MIT License
