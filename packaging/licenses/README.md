# Release-license fallbacks

Some npm packages declare a license but omit the license file from the
published tarball. Release assembly uses these canonical upstream texts only
for those packages:

- `radix-ui-primitives-MIT.txt` —
  <https://github.com/radix-ui/primitives/blob/main/LICENSE>
- `wouter-UNLICENSE.txt` —
  <https://github.com/molefrog/wouter/blob/main/LICENSE>

Both texts were verified against the linked upstream repositories on
2026-08-31. Packages that include their own license file always use that
package-local copy. Apache-2.0 packages missing a file use the identical
standard Apache 2.0 text from another bundled Apache-2.0 package.
