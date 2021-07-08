import babelParser from '@babel/parser';
import appendJsExtension from './appendJsExtension.js';
export const transformFile = async (sourceCode, sourceFileMetaData) => {
    const ast = babelParser.parse(sourceCode, {
        sourceType: 'module',
        plugins: [
            'jsx',
            'typescript',
        ],
    });
    return appendJsExtension(ast, sourceFileMetaData);
};
export default transformFile;
//# sourceMappingURL=transformFile.js.map