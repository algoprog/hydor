# Market Day Sums

Drop your card reader's weekend CSV file on the page and see your total takings, candles sold, best seller,
refunds, skipped lines and takings for each day. Nothing is kept.

## To use it

You need Node.js (version 20 or newer). There is nothing to install or build.

1. Open a terminal in this folder.
2. Type `npm start`.
3. Open http://127.0.0.1:3000 in your browser.
4. Drop your file in. `example-weekend.csv` is there if you want to try it first.

To stop it, press Ctrl+C in the terminal.

As started above, only your own computer can reach it.

## The file it reads

The first line is `date,item,quantity,price`, then one line for each sale, for example
`2027-05-08,"Lavender, large",2,12.50`. A minus quantity is a refund.
