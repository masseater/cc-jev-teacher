# 仕組みで名付けている兆候

| 兆候                                   | 例                                                   | ドメインの言葉にした例                |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| 役割を表す接尾辞だけで中身が分からない | `BookingDataProcessor`, `OrderManager`, `UserHelper` | `Reservation`, `OrderFulfillment`     |
| 何でも入る語                           | `data`, `info`, `item`, `record`, `payload`          | `invoice`, `seatAssignment`           |
| 処理の手順を並べた名前                 | `fetchAndSaveUser`, `validateThenSend`               | `registerMember`, `submitApplication` |
| 状態を真偽値や数値で持つ               | `isDone`, `status = 2`                               | `ReservationStatus.Confirmed`         |
| 呼び出し元の都合で名付けた             | `handleClick`, `onSubmitData`                        | `cancelReservation`                   |
| 同じものに複数の語                     | `customer` と `client` と `user` が同じ人を指す      | 用語集の一語に揃える                  |
