# cc-switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js CLI that switches Claude Code profiles and adds model discovery and model switching for OpenRouter-backed profiles.

**Architecture:** Keep config management and provider discovery separate. The CLI orchestrates file-backed Claude profile operations and calls provider adapters only for model listing. Model updates are file mutations, not shell hacks.

**Tech Stack:** Node.js, CommonJS, Commander, Jest

---

### Task 1: Scaffold package and test harness

**Files:**
- Create: `package.json`
- Create: `src/`
- Create: `tests/claude-config.test.js`
- Create: `tests/openrouter.test.js`

- [ ] **Step 1: Add project metadata and test script**
- [ ] **Step 2: Write failing config tests**
- [ ] **Step 3: Run config tests to verify failure**
- [ ] **Step 4: Write failing OpenRouter filtering tests**
- [ ] **Step 5: Run provider tests to verify failure**

### Task 2: Implement config/profile behavior

**Files:**
- Create: `src/claude-config.js`
- Create: `src/constants.js`
- Create: `src/utils.js`
- Test: `tests/claude-config.test.js`

- [ ] **Step 1: Implement profile file discovery**
- [ ] **Step 2: Implement active profile detection**
- [ ] **Step 3: Implement profile switching merge**
- [ ] **Step 4: Implement model update logic**
- [ ] **Step 5: Run config tests to verify pass**

### Task 3: Implement OpenRouter adapter and CLI

**Files:**
- Create: `src/providers/openrouter.js`
- Create: `src/cli.js`
- Create: `bin/cc-switcher.js`
- Test: `tests/openrouter.test.js`

- [ ] **Step 1: Implement OpenRouter filtering helpers**
- [ ] **Step 2: Run provider tests to verify pass**
- [ ] **Step 3: Add CLI commands for profiles/current/switch/models/use**
- [ ] **Step 4: Smoke test CLI help and representative commands**

### Task 4: Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Document commands, setup, and examples**
- [ ] **Step 2: Add respectful attribution to `foreveryh/claude-code-switch`**
- [ ] **Step 3: Add model discovery limitations and roadmap note**

