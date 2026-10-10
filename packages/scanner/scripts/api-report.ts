// Informe de la API pública (F4.1): por cada entry, sus exports con la declaración resuelta.
// `bun scripts/api-report.ts` reescribe api/public-api.md; `--check` falla si difiere (CI).
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const ENTRIES: Record<string, string> = {
  "@qhago/scanner": "src/index.ts",
  "@qhago/scanner (node)": "src/index.node.ts",
  "@qhago/scanner/polyfill": "src/polyfill/index.ts",
  "@qhago/scanner/parsers": "src/parsers/index.ts",
  "@qhago/scanner/quagga-compat": "src/quagga-compat/index.ts",
  "@qhago/scanner/ui": "src/ui/index.ts",
  "@qhago/scanner/worker-host": "src/worker-host.ts",
};
const OUT = "api/public-api.md";

const cfg = ts.getParsedCommandLineOfConfigFile(
  "tsconfig.json",
  {},
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
);
if (!cfg) throw new Error("tsconfig.json no encontrado");
const program = ts.createProgram(Object.values(ENTRIES), cfg.options);
const checker = program.getTypeChecker();
const printer = ts.createPrinter({ removeComments: true });

function strip(node: ts.Node): string {
  // Firma sin cuerpos: clases → miembros públicos; funciones → firma.
  const sf = node.getSourceFile();
  if (ts.isFunctionDeclaration(node)) {
    const n = ts.factory.updateFunctionDeclaration(
      node,
      node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
      node.asteriskToken,
      node.name,
      node.typeParameters,
      node.parameters,
      node.type ?? ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
      undefined,
    );
    return printer.printNode(ts.EmitHint.Unspecified, n, sf);
  }
  if (ts.isClassDeclaration(node)) {
    const members = node.members
      .filter(
        (m) =>
          !(
            ts.getCombinedModifierFlags(m as ts.Declaration) &
            (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)
          ) && !(m.name && ts.isPrivateIdentifier(m.name)),
      )
      .map((m) => {
        if (ts.isMethodDeclaration(m))
          return ts.factory.updateMethodDeclaration(
            m,
            m.modifiers?.filter((x) => x.kind !== ts.SyntaxKind.AsyncKeyword),
            m.asteriskToken,
            m.name,
            m.questionToken,
            m.typeParameters,
            m.parameters,
            m.type,
            undefined,
          );
        if (ts.isConstructorDeclaration(m))
          return ts.factory.updateConstructorDeclaration(m, m.modifiers, m.parameters, undefined);
        if (ts.isGetAccessor(m))
          return ts.factory.updateGetAccessorDeclaration(
            m,
            m.modifiers,
            m.name,
            m.parameters,
            m.type,
            undefined,
          );
        if (ts.isPropertyDeclaration(m))
          return ts.factory.updatePropertyDeclaration(
            m,
            m.modifiers,
            m.name,
            m.questionToken,
            m.type ??
              ts.factory.createTypeReferenceNode(
                checker.typeToString(checker.getTypeAtLocation(m)),
              ),
            undefined,
          );
        return m;
      });
    const n = ts.factory.updateClassDeclaration(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      members,
    );
    return printer.printNode(ts.EmitHint.Unspecified, n, sf);
  }
  if (ts.isVariableDeclaration(node)) {
    const t = checker.typeToString(
      checker.getTypeAtLocation(node),
      undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.MultilineObjectLiterals,
    );
    return `const ${node.name.getText()}: ${t};`;
  }
  return printer.printNode(ts.EmitHint.Unspecified, node, sf);
}

let md =
  "# API pública de @qhago/scanner\n\nGenerado por `scripts/api-report.ts`. No editar a mano: un cambio aquí es un cambio de API.\n";
for (const [name, file] of Object.entries(ENTRIES)) {
  const sf = program.getSourceFile(file);
  const sym = sf && checker.getSymbolAtLocation(sf);
  if (!sym) throw new Error(`sin símbolo: ${file}`);
  md += `\n## ${name}\n\n\`\`\`ts\n`;
  for (const e of checker.getExportsOfModule(sym).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e;
    for (const d of target.declarations ?? []) md += `${strip(d).trim()}\n`;
  }
  md += "```\n";
}

if (process.argv.includes("--check")) {
  const prev = readFileSync(OUT, "utf8");
  if (prev !== md) {
    console.error(
      `${OUT} desactualizado: la API pública cambió. Ejecuta 'bun scripts/api-report.ts' y revisa el diff.`,
    );
    process.exit(1);
  }
  console.log("API sin cambios");
} else {
  writeFileSync(OUT, md);
  console.log(`escrito ${OUT}`);
}
