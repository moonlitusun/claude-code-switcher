#!/usr/bin/env node

import { createProgram } from "../src/cli";

await createProgram().parseAsync(process.argv);
