bizbeecms it's a multi site B2B whitelabel CMS. It has two major components: a ProjectManager and a
CMS. Both are cloudflare native and only use cloudflare services.
The ProjectManager has the following user roles:
- SuperAdmin: the first user that registers with email and password. A SuperAdmin can do everything.
- Admin: Admins can be invited by SuperAdmins or other Admins with invite rights. Admins can be scoped by country. Admins can invite
- SiteManagers can be invited by SuperAdmins or Admins and assigned to existing sites. SiteManagers can create and manage sites. SiteManagers can also be scoped by country.

A Site is a project, one or more ProjectManager users can work on the same project.
A site is a deployment of the CMS to cloudflare. 
Both the ProjectManager and the CMS are Next.js applications. We have a version of the CMS implemented here [aicms](../aicms) use it for
inspiration, we have already solved there some neat tricks about AI Agents implementation and generating and rendering components server side.
