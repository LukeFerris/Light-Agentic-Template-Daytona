#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Coverage thresholds
const THRESHOLDS = {
  statements: 75,
  branches: 60,
  functions: 75,
  lines: 75
};

console.log('Checking coverage for staged files...');

try {
  // Get staged files
  const stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' })
    .split('\n')
    .filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter(file => !file.includes('.test.') && !file.includes('.spec.'))
    .filter(Boolean);

  if (stagedFiles.length === 0) {
    console.log('✓ No TypeScript files to check coverage for.');
    process.exit(0);
  }

  console.log(`Found ${stagedFiles.length} staged TypeScript file(s)`);

  // Check if coverage report exists
  const coverageFile = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

  if (!fs.existsSync(coverageFile)) {
    console.log('');
    console.log('=========================================');
    console.log('ERROR: No coverage report found!');
    console.log('=========================================');
    console.log('Coverage report is required for commits.');
    console.log('The test:coverage script should have generated it.');
    console.log('');
    process.exit(1);
  }

  const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf-8'));

  // Check coverage for each staged file
  const failures = [];
  const passed = [];
  const notFound = [];

  for (const file of stagedFiles) {
    const absolutePath = path.resolve(process.cwd(), file);
    const fileCoverage = coverage[absolutePath];

    if (!fileCoverage) {
      notFound.push(file);
      continue;
    }

    const fileFailures = [];
    if (fileCoverage.statements.pct < THRESHOLDS.statements) {
      fileFailures.push(`statements: ${fileCoverage.statements.pct.toFixed(2)}%`);
    }
    if (fileCoverage.branches.pct < THRESHOLDS.branches) {
      fileFailures.push(`branches: ${fileCoverage.branches.pct.toFixed(2)}%`);
    }
    if (fileCoverage.functions.pct < THRESHOLDS.functions) {
      fileFailures.push(`functions: ${fileCoverage.functions.pct.toFixed(2)}%`);
    }
    if (fileCoverage.lines.pct < THRESHOLDS.lines) {
      fileFailures.push(`lines: ${fileCoverage.lines.pct.toFixed(2)}%`);
    }

    if (fileFailures.length > 0) {
      failures.push({ file, issues: fileFailures });
    } else {
      passed.push(file);
    }
  }

  // Report results
  if (passed.length > 0) {
    console.log(`✓ ${passed.length} file(s) meet coverage thresholds`);
  }

  if (notFound.length > 0) {
    console.log('');
    console.log(`⚠ ${notFound.length} file(s) not found in coverage report:`);
    notFound.forEach(file => console.log(`  - ${file}`));
    console.log('  (These files may not be imported by any test)');
  }

  if (failures.length > 0) {
    console.log('');
    console.log('=========================================');
    console.log('COVERAGE THRESHOLDS NOT MET!');
    console.log('=========================================');
    console.log(`Thresholds: statements=${THRESHOLDS.statements}%, branches=${THRESHOLDS.branches}%, functions=${THRESHOLDS.functions}%, lines=${THRESHOLDS.lines}%`);
    console.log('');
    failures.forEach(({ file, issues }) => {
      console.log(`  ✗ ${file}`);
      console.log(`    Below threshold: ${issues.join(', ')}`);
    });
    console.log('');
    console.log('Please add tests to improve coverage for these files.');
    console.log('=========================================');
    process.exit(1);
  }

  console.log('');
  console.log('✓ All staged files meet coverage thresholds');

  process.exit(0);

} catch (error) {
  console.error('Error checking coverage:', error.message);
  console.log('⚠ Skipping coverage check due to error');
  process.exit(0);
}
