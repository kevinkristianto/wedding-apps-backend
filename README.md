# wedding-apps-backend
This is a shared backend for the wedding apps in this account (event-table-management-app and wedding-guest-guide app).

All db is now postgres in supabase. 

To start the server locally, run npm start.

This backend is deployed via render, and both local and prod environment point to the same db, hence there's no need to run the backstage locally, even when developing/updating data in the db locally. 
