package com.codewithmosh.store.orders;

public class OrderCanceledException extends RuntimeException {
    public OrderCanceledException() {
        super("This order is canceled and can no longer change.");
    }
}
