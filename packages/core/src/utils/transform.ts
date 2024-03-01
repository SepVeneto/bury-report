import { parse, prettyPrint, types, visit } from 'recast'
import { isUniH5, isUniapp, isVue2 } from '.'
import { COLLECT_ERROR } from './constant'
import parser from '@babel/parser'

const reportContent = `
_brReport('${COLLECT_ERROR}', error)
`
const n = types.namedTypes

export function proxyConsoleError(source: string) {
  const ast = parse(source, { parser })
  visit(ast, {
    visitImportDeclaration: function (path) {
      if (path.node.source.value !== '@sepveneto/report-core') {
        this.traverse(path)
        return
      }
      path.insertAfter(`
const _tempError = console.error
console.error = function() {
  for (const arg of arguments) {
    if (arg instanceof Error) {
      const error = {
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
      }
      ${reportContent}
      break
    }
    if (globalThis.PromiseRejectionEvent && arg instanceof PromiseRejectionEvent) {
      const error = {
        name: arg.reason.name,
        message: arg.reason.message,
        stack: arg.reason.stack,
      }
      ${reportContent}
      break
    } else {
      console.warn(arg)
    }
  }
  _tempError.apply(this, arguments)
}
`)
      if (!isUniapp() || isUniH5()) {
        path.insertAfter(`
if (window) {
  window.addEventListener('unhandledrejection', (evt) => {
    console.error(evt)
  })
}
`)
      } else {
        path.insertAfter(`
uni.onError((evt) => {
  console.error(evt)
})
`)
      }
      return false
    },
  })

  return prettyPrint(ast).code
}

export function insertCodeByVue(source: string) {
  const ast = parse(source, {
    parser,
  })
  visit(ast, {
    visitImportDeclaration: function (path) {
      if (!isVue2) return false
      const importName = getImportName(path.node)
      if (!importName) return false

      path.insertAfter(`${importName}.config.errorHandler = (err, instance, info) => {
        ${reportContent}
}`)

      this.traverse(path)
    },
    visitVariableDeclaration: function (path) {
      if (isVue2) return false

      const instanceName = getInstanceName(path.node)
      if (!instanceName) {
        return false
      }

      path.insertAfter(`${instanceName}.config.errorHandler = (err, instance, info) => {
        console.log(err, err.message)
        ${reportContent}
}`)
      this.traverse(path)
    },
  })
  return prettyPrint(ast).code
}

function getInstanceName(node: types.namedTypes.VariableDeclaration) {
  let name
  node.declarations.forEach(declaration => {
    if (!n.VariableDeclarator.check(declaration)) return
    if (!declaration.init) return
    if (!n.CallExpression.check(declaration.init)) return
    if (!n.Identifier.check(declaration.init.callee)) return
    if (declaration.init.callee.name !== 'createSSRApp') return
    if (!n.Identifier.check(declaration.id)) return

    name = declaration.id.name
  })
  return name
}

function getImportName(node: types.namedTypes.ImportDeclaration) {
  let name
  if (node.source.value !== 'vue') return

  node.specifiers?.forEach(specifer => {
    if (!n.ImportDefaultSpecifier.check(specifer)) return
    name = specifer.local?.name
  })
  return name
}
