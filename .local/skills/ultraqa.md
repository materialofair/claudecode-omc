## Enhanced Test Generation Integration

### Automatic Test Generation

UltraQA now automatically generates missing tests during the QA cycle:

1. **Identify Missing Tests**: Check which changed files lack test coverage
2. **Generate Tests**: Use `/test-gen` to create tests for uncovered files
3. **Run Tests**: Execute generated tests
4. **Analyze Coverage**: Identify remaining gaps
5. **Fix Issues**: If tests fail, fix and regenerate
6. **Repeat**: Continue until coverage threshold met (default: 80%)

### Workflow

```
User: /ultraqa

Agent: Starting UltraQA cycle...

Agent: Analyzing changed files...
- src/utils/math.ts (no test file)
- src/services/payment.ts (test exists, but coverage 45%)

Agent: Generating missing tests...
✅ Generated: src/utils/math.test.ts

Agent: Analyzing coverage gaps in src/services/payment.ts...
- Lines 42-48: Error handling not covered
- Lines 67-72: Edge case for retries

Agent: Generating supplementary tests...
✅ Added 3 test cases to src/services/payment.test.ts

Agent: Running all tests...
✅ All tests passing

Agent: Coverage analysis...
- Overall coverage: 85%
- src/utils/math.ts: 100%
- src/services/payment.ts: 82%

✅ UltraQA cycle complete. Coverage threshold met.
```

### Configuration

Add to `.omc/project-config.json`:

```json
{
  "ultraqa": {
    "autoGenerateTests": true,
    "coverageThreshold": 80,
    "maxCycles": 5
  }
}
```
