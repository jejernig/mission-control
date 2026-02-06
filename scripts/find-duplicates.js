#!/usr/bin/env node

/**
 * Script to find duplicate function patterns in TypeScript codebase
 * Looks for similar function signatures, patterns, and common utilities
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getAllTsFiles(dir) {
  const files = execSync(`find ${dir} -type f \\( -name "*.ts" -o -name "*.tsx" \\) | grep -v node_modules`)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  return files;
}

function extractFunctions(content, filePath) {
  const functions = [];
  
  // Match function declarations and expressions
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*{/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>/g,
    /(?:export\s+)?const\s+(\w+):\s*[^=]+=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>/g,
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const start = match.index;
      // Extract a reasonable snippet (first 200 chars of function body)
      const snippet = content.substring(start, start + 200).split('\n').slice(0, 5).join('\n');
      
      functions.push({
        name,
        file: filePath,
        snippet,
        signature: match[0]
      });
    }
  });
  
  return functions;
}

function findCommonPatterns(content) {
  const patterns = {
    'NextResponse.json error': (content.match(/NextResponse\.json\s*\(\s*\{\s*error/g) || []).length,
    'try-catch blocks': (content.match(/try\s*{[\s\S]*?}\s*catch/g) || []).length,
    'Zod validation': (content.match(/\.parse\(|\.safeParse\(/g) || []).length,
    'Database queries (db.)': (content.match(/\bdb\.\w+\./g) || []).length,
    'Request.json()': (content.match(/await\s+(?:req|request)\.json\(\)/g) || []).length,
    'URL params': (content.match(/params\.\w+/g) || []).length,
    'searchParams.get': (content.match(/searchParams\.get\(/g) || []).length,
  };
  
  return patterns;
}

function analyzeCodebase() {
  console.log('🔍 Scanning for duplicate functions and patterns...\n');
  
  const srcDir = path.join(process.cwd(), 'src');
  const files = getAllTsFiles(srcDir);
  
  console.log(`Found ${files.length} TypeScript files\n`);
  
  const allFunctions = [];
  const patternStats = {};
  const filePatterns = [];
  
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    const functions = extractFunctions(content, file);
    allFunctions.push(...functions);
    
    const patterns = findCommonPatterns(content);
    filePatterns.push({ file, patterns });
    
    Object.entries(patterns).forEach(([pattern, count]) => {
      if (!patternStats[pattern]) patternStats[pattern] = { count: 0, files: [] };
      patternStats[pattern].count += count;
      if (count > 0) patternStats[pattern].files.push({ file, count });
    });
  });
  
  // Find duplicate function names
  const functionsByName = {};
  allFunctions.forEach(fn => {
    if (!functionsByName[fn.name]) functionsByName[fn.name] = [];
    functionsByName[fn.name].push(fn);
  });
  
  const duplicateFunctions = Object.entries(functionsByName)
    .filter(([_, fns]) => fns.length > 1)
    .sort((a, b) => b[1].length - a[1].length);
  
  // Report
  console.log('═══════════════════════════════════════════════════════════');
  console.log('DUPLICATE FUNCTION NAMES');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  duplicateFunctions.slice(0, 30).forEach(([name, instances]) => {
    console.log(`\n📦 ${name} (${instances.length} instances):`);
    instances.forEach(fn => {
      console.log(`   └─ ${fn.file.replace(srcDir + '/', '')}`);
    });
  });
  
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('COMMON PATTERNS (potential for utility extraction)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  Object.entries(patternStats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([pattern, stats]) => {
      console.log(`\n🔄 ${pattern}: ${stats.count} occurrences across ${stats.files.length} files`);
      console.log('   Top files:');
      stats.files
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .forEach(({ file, count }) => {
          console.log(`   └─ ${file.replace(srcDir + '/', '')} (${count})`);
        });
    });
  
  // High-pattern files (candidates for refactoring)
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('FILES WITH HIGH DUPLICATION POTENTIAL');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const highPatternFiles = filePatterns
    .map(fp => ({
      file: fp.file,
      totalPatterns: Object.values(fp.patterns).reduce((sum, count) => sum + count, 0)
    }))
    .filter(fp => fp.totalPatterns > 5)
    .sort((a, b) => b.totalPatterns - a.totalPatterns)
    .slice(0, 20);
  
  highPatternFiles.forEach(({ file, totalPatterns }) => {
    console.log(`└─ ${file.replace(srcDir + '/', '')} (${totalPatterns} patterns)`);
  });
  
  // Summary
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Total functions found: ${allFunctions.length}`);
  console.log(`Duplicate function names: ${duplicateFunctions.length}`);
  console.log(`Total pattern occurrences: ${Object.values(patternStats).reduce((sum, s) => sum + s.count, 0)}`);
  console.log(`\nRecommendation: Extract common patterns to src/lib/utils/ and src/lib/api-helpers.ts`);
}

try {
  analyzeCodebase();
} catch (error) {
  console.error('Error analyzing codebase:', error.message);
  process.exit(1);
}
