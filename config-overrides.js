const { override, fixBabelImports, addLessLoader } = require('customize-cra');
const darkTheme = require('@ant-design/dark-theme');

module.exports = override(
  fixBabelImports('import', {
    libraryName: 'antd',
    libraryDirectory: 'es',
    style: true,
  }),
  addLessLoader({
    lessOptions: {
      javascriptEnabled: true,
      modifyVars: darkTheme.default,
    },
  })
);
