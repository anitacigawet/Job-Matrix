JOB MATRIX 1.0.0
================

WINDOWS PORTABLE RELEASE

1. Extract the entire ZIP to a folder you can keep.
2. Double-click "Start Job Matrix.cmd".
3. Keep the server window open while using Job Matrix.

The launcher chooses an available local port, waits for Job Matrix to be ready,
and then opens it in your browser. The program listens only on 127.0.0.1. Its
database and settings stay in the extracted folder under data\.

The portable Windows releases include Node.js. You do not need pnpm, npm, Git,
or the source repository.

NODE RUNTIME RELEASE

Job-Matrix-v1.0.0-runtime.zip contains the same compiled program and production
dependencies without an embedded Node executable. It requires Node.js 22.22.0
or newer on Windows; Node.js 24.20.0 LTS is recommended. Use
"Start Job Matrix.cmd". Optional JobSpy sources require Python 3.10 or newer on
PATH; the core application and no-key sources do not.

OPTIONAL CONFIGURATION

Job Matrix starts without API keys. Configure AI and job-source keys through
Settings in the interface. You can also copy .env.example to .env and edit the
copy before starting the program. Portable releases always keep the database,
settings, and managed Python environment under data\; storage path overrides
in .env are intentionally ignored.

OPTIONAL JOBSPY SOURCES

Indeed, LinkedIn, Glassdoor, ZipRecruiter, and Google Jobs use the optional
Python JobSpy path. Install Python 3.10 or newer if you want those sources. The
first JobSpy search creates its own environment and installs the Python
packages it needs. Sources such as Remotive, Remote OK, and The Muse do not
need Python or an API key.

STOPPING THE PROGRAM

Press Ctrl+C in the server window, or close that window. Your data remains in
the extracted folder for the next run.

FILES INCLUDED

- dist\                       compiled Job Matrix application
- node_modules\sql.js\        minimal SQLite JavaScript/WASM runtime files
- runtime\node.exe            Node.js runtime (portable Windows ZIPs only)
- runtime\LICENSE             Node.js license and bundled third-party notices
- drizzle\migrations\         database setup and upgrade files
- requirements.txt            canonical optional Python dependency list
- .env.example                optional environment configuration template
- docs\CONCIERGE_PROMPT.md     browser-agent prompt
- licenses\                   bundled-package license texts and metadata
- LICENSE, SECURITY, notices  project terms, safety, and third-party notices
- MANIFEST.sha256             checksums for every packaged payload file

This release intentionally excludes project and dependency source trees,
tests, type declarations, source maps, CI configuration, development scripts,
internal planning notes, and repository maintenance files. The full project
source remains available from the GitHub repository.
