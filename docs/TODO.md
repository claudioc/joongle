
  MVP
  - when we catch an error, we should log what it is. The ErrorWithFeedback should augment the original error object
  - there are several db access in the dbservice not protected by try catch
  - we should be able to reorganize pages on the same level

  MEDIUM
  - back and forth navigation works in a weird way with XHR: need to hook in the history events to update it? It's too easy to make put the menu and the page content out-of-sync
  - allow to duplicate/copy a page (needs to specify parent?)
  - consider putting deleted page in a Trash bin instead of deleting them (or "Archive")

  LOW
  - use kitajs? https://github.com/kitajs/html
  - consider access implications to the history of docs
  - collection of actions for audit purposes (log)
  - couchdb must be configured to run in production
  - we are always using 303 to redirect - check if that makes sense
  - do we need a "Revert to this version" for the history? (probably not)
  - uses CSRF for delete and move page? (probably not)
  - unit tests for the dbService would be good.
  - There is also Lexical as an possible replacement for tiptap, if needed

Done
- Save the history of a page
- Move a page to another parent
- Add the date of creation and update
- consider starting mongodb with a replicaset to enable transactions
- refactor the router creating services
- delete should also remove the history
- uses mongodb sanitizer
- move the page buttons to a dropdown
- Show history of pages
- show single history item
- user user input sanitizer
- uses CSRF for create and edit page
- bug: feedback shows differently from alpine and normal render
- needs also to check for uniqueness in the pageSlugs array
- find a way to not move the menu when we change page (load page with HTMX?)
- Consider Alpine global store for the state of the notifications
- consider creating an esbuild.js and simplify packages.json
- make the port for livereload a constant (for the CSP)
- use a fastify proxy for the livereload to 8001 and 8000
- consider just removing the need of pageId and use the _id field
- Rolling window for history? (not needed with couchdb)
- Some feedback errors must be renamed a bit because they are very mongo-like
- A long PRE breaks the layout
- a simple lock system should be in place
- how do we load the editor only when needed?
- pass the fastify instance to the views using context?
- internazionalization
- Check what happens if we cannot connect to the db on bootstrap
- make the name of the database configurable
- add a icon library (the chevron in pageMenu for example or in the message notifications)
- a page for the settings and then use them
- switch language from the settings
- to find one document, we need to use get(_id), not find() with a select and limit 1
- the error and success strings must be translated
- translate the content of the landing page
- better design for the search results
- set page title and page description in the settings
- Try errors with curl (ie /parts/nav/br0ken) and see why it does return