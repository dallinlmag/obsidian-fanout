# what
This is an obsidian plugin that will use the daily note to fill in other notes with topics that I deem important, but I only want to update one place, the daily note. 

# how
I will utilize sections of the daily note and then depending on the section content, I will copy it over to a different note using rules that are configurable by the user. The sections will be separated the headers (##), maybe this can be configurable.

## Technical
Obsidian plugin that runs a job once a day after the daily note should not change (this could be configurable) or could be when the next day's daily note is opened. It will reference the setting configuration and then depending on the set rules, it will act on the data of the daily note (or other note ) and copy the data into other places in the vault. 

# Uses
- dreams to the dream journal
- daily resolution tracker
- ideas for videos, projects, etc..
- time tracker for projects. 
- pokemon pack openings
- task tracking from todo lists
- videos,  books,  games stats
- 

Features to implement
- read rule files
- let source note be configurable 
- supported rules to include appending text from section to specified note. 
- include date when appending data
- create new notes instead of appending if desired
- decide when to run job in plugin config
- append to a table or other Markdown entity
- http callout with payload from the data for things like home assistant. To update dashboards 