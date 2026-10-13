export const ROUTES = {
  HOME: '/',
  PROFILES: '/profiles',
  BROWSE: '/browse',
  SEARCH: '/search',
  TITLE: (id: string) => `/title/${id}`,
  WATCH: (kind: string, id: string) => `/watch/${kind}/${id}`,
  MY_LIST: '/my-list',
  ADMIN: '/admin',
};

export const BREAKPOINTS = {
  mobile: '480px',
  tablet: '768px',
  desktop: '1200px',
};
