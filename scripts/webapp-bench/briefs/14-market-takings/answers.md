# What the maker says, if asked

- **Name of the thing:** Market Day Sums.
- **The file:** plain text with commas (a CSV). The first line is the headings: date,item,quantity,price. Every other line is one sale: the date written like 2027-05-08, the candle's name, the quantity (a whole number, minus for a refund) and the price of one candle in pounds (like 12.50, never negative). A candle's name may have a comma in it if it is in double quotes, like "Lavender, large". Empty lines are ignored.
- **What I get back:** total takings (pounds, to the penny, refunds already taken off); candles sold (the quantities added up, refunds taken off); best seller (the candle with the most sold after refunds; if two are level, the one that comes first in the file; capitals and spaces at the ends make no difference to which candle is which, and I want it shown as it was first written); refunds (how many lines were refunds); skipped lines (how many lines could not be read); and takings for each day, earliest day first.
- **A line that cannot be read** (not four parts, a quantity that is not a whole number, a price that is not a number, a date that is not a real date, no candle name) is left out of everything and counted in skipped lines. The rest of the file still counts.
- **A file that is not mine** (empty, no heading line, or headings that are not date,item,quantity,price): it should say so in a sentence and give no answer.
- **Who needs to log in:** nobody. Nothing is kept.
- **Colour:** no idea, something candle-warm.
- **Anything else not covered here:** the maker says: you decide.
