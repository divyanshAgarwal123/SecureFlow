# CODEOWNERS reporting verification

Source commit `0fba786fec6ada9bdcd89600fc9d966f6fa3562d`. Parent `dbc964f7f6ab4b7dffe6f9d04a280d62d6ff9d23`.

The six focused Vitest files passed all 135 tests. The committed fixture demo annotates findings using only a mocked base revision and verifies that a head-only file does not change the original output. A separate direct comparison of report output from the exact upstream parent and source commit produced identical files. The raw fixture output hashes were both 8f07bfd11a64454eea14ec290adfea3f0525b9d29daf37fd9d10513f41896e6a.

Scoped lint reported zero errors and two fewer warnings than the parent. The branch and parent still report the same upstream tracing type errors. The normal production build fails in the same unchanged OpenTelemetry import.
