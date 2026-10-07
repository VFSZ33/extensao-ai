const importsConfig = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            message: "Use um alias em vez de uma importação relativa.",
            regex: "^\\.{1,2}(/|$)",
          },
        ],
      },
    ],
    "no-restricted-syntax": [
      "error",
      {
        message: "Use um alias em vez de uma importação relativa.",
        selector:
          ":matches(ImportExpression, TSImportType)[source.value=/^\\.{1,2}(\\u002f|$)/]",
      },
      {
        message: "Use um alias em vez de uma importação relativa.",
        selector:
          "ImportExpression[source.expressions.length=0][source.quasis.0.value.cooked=/^\\.{1,2}(\\u002f|$)/]",
      },
      {
        message: "Use um alias em vez de uma importação relativa.",
        selector:
          "CallExpression[callee.name='require'][arguments.0.value=/^\\.{1,2}(\\u002f|$)/]",
      },
      {
        message: "Use um alias em vez de uma importação relativa.",
        selector:
          "CallExpression[callee.name='require'][arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=/^\\.{1,2}(\\u002f|$)/]",
      },
    ],
  },
};

export default importsConfig;
