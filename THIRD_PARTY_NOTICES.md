# Third-party notices

Job Matrix uses open-source libraries whose licenses remain their own. The
project's central upstream dependency is acknowledged here so that its role and
authorship remain visible.

## Bundled JavaScript dependencies

Release archives include a generated `licenses/` directory with the declared
license, attribution metadata, and complete license text for every direct or
transitive JavaScript package embedded in the compiled client or server. The
small external `sql.js` runtime also retains its upstream `LICENSE` and
`AUTHORS` files beside its executable JavaScript and WebAssembly files.

## Node.js

The Windows portable releases include an unmodified official Node.js runtime.
Its upstream license is included beside the executable in the release's
`runtime/` directory. Node.js is a separate open-source project and is not
owned by Job Matrix or its contributors.

## JobSpy

Job Matrix optionally invokes
[`python-jobspy`](https://github.com/speedyapply/JobSpy) to gather listings from
public job-board surfaces. JobSpy is a separate open-source project and is not
owned by Job Matrix or its contributors.

> MIT License
>
> Copyright (c) 2023 Cullen Watson
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

The copy above reflects JobSpy's upstream `LICENSE` when Job Matrix 1.0.0 was
prepared.
