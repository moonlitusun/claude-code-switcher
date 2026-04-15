#!/usr/bin/env node

const { createProgram } = require("../src/cli");

createProgram().parseAsync(process.argv);
