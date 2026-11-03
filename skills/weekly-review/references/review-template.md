# Weekly review: template and scheduled prompt

## The written review

```markdown
# Week of <Monday's date>: review

## Last week
- **Done:** <three to five things, outcomes first>
- **Went well:** <one or two>
- **Didn't happen:** <item>, because <reason> → <carry over / drop / reschedule>
- **Time:** <n> h in meetings, <n> h of focused work (meant to be <n>)
- **Do differently:** <one thing>

## Stuck
- <item>: <the sign> → <the move>

## Next week (about <n> focused hours free)
1. **<Priority, as an outcome>**: <Tue 9–11, Thu 9–11>
2. **<Priority>**: <blocks>
3. **<Priority>**: <blocks>

**Deadlines:** <date>: <item>
**Waiting for:** <who>, <what>, asked <date>, chase on <date>
**Next actions:** calls: <…> · computer: <…> · errands: <…>
**Someday:** <parked ideas>
```

Keep each line short. The review is for the person to act on, not a diary.

## Capacity, worked out

| | Hours |
| --- | --- |
| Working hours in the week | 40 |
| Meetings and calls already booked | −12 |
| Travel and fixed commitments | −3 |
| Buffer for the unplanned (25% of what is left) | −6 |
| **Focused hours available** | **19** |

If the three priorities need 26 hours, say so: "The plan needs about 26 hours and the week has 19.
Which of these can move, shrink or go to someone else?"

## A scheduled run that prepares the review

Offer it with `schedule_task`. A run starts with nothing of the conversation, so the prompt says
everything. Adjust the tools and names to what the person has connected.

- **Name:** Weekly review prep
- **When:** Fridays at 16:00, `{ "kind": "daily", "time": "16:00", "days": [5] }`
- **Prompt:**

> Prepare my weekly review as a draft; do not change any calendar, task or email. Read my calendar
> for the past 7 days and the next 14 days, my open and recently completed tasks in Todoist, and the
> emails I flagged or have not answered in the past 7 days. Find last week's review: the newest
> document in my Library titled "Week of …" (get_page lists them), and read its three priorities.
> Write a new document titled "Week of <next Monday's date>: review" with: what got done; which of
> last week's priorities happened and which did not; items that look stuck (projects with nothing
> finished in two weeks, tasks moved three or more times, waiting-for items older than a week); next
> week's fixed commitments and the focused hours left after a 25% buffer; and three suggested
> priorities, each with a one-line reason. Leave the final choice of priorities to me. Finish with a
> one-line summary of the week.

The run's own report tells the person when it is ready; there is no need to send a separate
notification.

## Questions that help the look back

- What took more time than it deserved?
- What did I say yes to that I should have declined?
- Who am I waiting on, and who is waiting on me?
- What would make next week feel like a good week?
