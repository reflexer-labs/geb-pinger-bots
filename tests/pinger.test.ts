// import lambdaTester from 'lambda-tester';
// import { expect } from 'chai';
// import { findOne} from '../app/handler';
// import * as booksMock from './books.mock';
// import { books as BooksModel } from '../app/model/books';
// import sinon from 'sinon';

describe("FindOne [GET]", () => {
  it("success", () => {
    // try {
    //   const s = sinon
    //     .mock(BooksModel);
    //   s.expects('findOne')
    //     .atLeast(1)
    //     .atMost(3)
    //     .resolves(booksMock.findOne);
    //   return lambdaTester(findOne)
    //   .event({ pathParameters: { id: 25768396 } })
    //   .expectResult((result: any) => {
    //     expect(result.statusCode).to.equal(200);
    //     const body = JSON.parse(result.body);
    //     expect(body.code).to.equal(0);
    //     s.verify();
    //     s.restore();
    //   });
    // } catch (err) {
    //   console.log(err);
    // }
  });
});
