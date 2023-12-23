export const menus = {
  1: [
    {
      name: '一级菜单',
      path: '/',
      route: 'menu',
    },
  ],
  2: [
    {
      name: '菜单',
      path: 'menu',
      route: 'SystemMenu',
      children: [
        {
          name: '列表',
          path: 'list',
          route: 'SystemMenuList',
        },
      ],
    },
    {
      name: '权限',
      path: 'auth',
      route: 'SystemAuth',
      children: [
        {
          name: '管理员',
          path: 'admin',
          route: 'SystemAuthAdmin',
        },
        {
          name: '管理组',
          path: 'group',
          route: 'SystemAuthGroup',
        },
      ],
    },
    {
      name: '接口',
      path: 'interface',
      route: 'SystemInterfaceList',
      // children: [
      //   {
      //     name: '列表',
      //     path: 'list',
      //     route: 'SystemInterfaceList',
      //   }
      // ]
    },
  ],
}
