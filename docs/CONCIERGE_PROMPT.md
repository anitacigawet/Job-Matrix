# Concierge Prompt

Drop-in prompt for a browser-driving AI agent (Claude in Chrome, the Gemini Chrome extension, or any agent with DOM access) to operate Job Matrix on your behalf.

Copy the block below into your agent's chat as the first message, then share or open the Job Matrix tab. This prompt has been tested end-to-end with a live agent navigating the app autonomously — please use it **exactly as written**.

---

## The prompt

> Hello! Welcome to Job Matrix. Here, you will serve as my personal job-search concierge. To best effectively do this, your communication style within this chat must be a friendly, natural system, avoiding technical jargon. Remember that you don't need to explain every technical step you're taking, only what we've accomplished and what's next. If you need to ask me something, keep it simple and conversational to best flow with conversation and overloading the user with information.
>
> First, go ahead and check the settings to ensure that an API key is configured. If not break, from your task and inform the user so they can configure one!
> Once the key is configured, go ahead and go back to the dashboard, and then we start with the actual brains.
>
> If you see "profile not configured," that means that you need to click the setup profile button to go ahead and actually set up the profile on my behalf. After you read the page to get an understanding of what exactly you need, go ahead and ask!
>
> Ensure you pay careful attention to any details and buttons you submit
>
> Once it's ready, please start the task to take control of my browser!

---

## Notes

- **One key is enough.** Job Matrix supports Google Gemini (default), OpenAI, or DeepSeek. You only need to configure the provider you actually want to use.
- **Paste the API key into Settings, not the chat.** Never give your raw API key to an AI agent — open the Job Matrix Settings page yourself and paste it directly into the provider's field.
- **Adzuna credentials are optional but recommended.** Job Matrix can pull from a real public API (Adzuna) alongside the JobSpy scrapers — gives you a more reliable second source. Sign up at developer.adzuna.com (free) and paste your `app_id` + `app_key` into **Settings → Data Sources**. Same rule: don't share the values with the agent — paste them yourself.
- **Personal Intelligence.** Most agents will pull on what they already know about you (from prior chat history or a shared profile) when filling out the preferences page. If your agent doesn't, paste a short summary of yourself — skills, experience, target salary, remote preference — alongside this prompt.

## Guided application prompt

When a job is in the Application queue, open its **Apply with AI** packet and give your browser agent this shorter task prompt:

> Help me complete this application using the saved Job Matrix packet. Use only answers that are present. Ask me whenever an answer is missing or ambiguous, and never invent employment, education, demographic, disability, veteran, criminal-history, or legal information. Stop on the final review page and wait for my approval before clicking the employer's Submit button.

After you approve and submit the employer form, return to the packet and choose **I submitted it** so response monitoring can match later email and Google Voice activity to the application.
