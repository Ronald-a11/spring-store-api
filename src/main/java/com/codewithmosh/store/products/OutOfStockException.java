package com.codewithmosh.store.products;

public class OutOfStockException extends RuntimeException {
    public OutOfStockException(String productName, int inStock) {
        super(inStock > 0
                ? "Only " + inStock + " left in stock for " + productName + "."
                : productName + " is out of stock.");
    }
}
