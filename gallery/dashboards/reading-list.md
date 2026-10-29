---
cssclass: dashboard
---
# Reading list

```basalt
title: Reading now
from: Reading
where: status = reading
show: cards
```

```basalt
title: Up next
from: Reading
where: status = next
show: table
columns: author
```

```basalt
title: Finished
from: Reading
where: status = done
show: table
columns: author, rating
sort: -rating
```
