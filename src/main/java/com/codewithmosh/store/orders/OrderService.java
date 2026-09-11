package com.codewithmosh.store.orders;

import com.codewithmosh.store.auth.AuthService;
import com.codewithmosh.store.products.StockService;
import lombok.AllArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@AllArgsConstructor
@Service
public class OrderService {
    private final AuthService authService;
    private final OrderRepository orderRepository;
    private final OrderMapper orderMapper;
    private final StockService stockService;

    public List<OrderDto> getAllOrders() {
        var user = authService.getCurrentUser();
        var orders = orderRepository.getOrdersByCustomer(user);
        return orders.stream().map(orderMapper::toDto).toList();
    }

    public OrderDto getOrder(Long orderId) {
        var order = orderRepository
                .getOrderWithItems(orderId)
                .orElseThrow(OrderNotFoundException::new);

        var user = authService.getCurrentUser();
        if (!order.isPlacedBy(user)) {
            throw new AccessDeniedException("You don't have access to this order.");
        }

        return orderMapper.toDto(order);
    }

    public List<AdminOrderDto> getAllOrdersForAdmin() {
        return orderRepository.getAllOrdersWithItems().stream().map(orderMapper::toAdminDto).toList();
    }

    @Transactional
    public AdminOrderDto updateFulfillmentStatus(Long orderId, FulfillmentStatus status) {
        var order = orderRepository.findByIdForUpdate(orderId).orElseThrow(OrderNotFoundException::new);
        if (order.isCanceled()) {
            throw new OrderCanceledException();
        }

        if (status == FulfillmentStatus.CANCELED) {
            cancel(order);
        } else {
            order.setFulfillmentStatus(status);
        }
        orderRepository.save(order);

        return orderMapper.toAdminDto(order);
    }

    // Callers load the order with findByIdForUpdate, so its items go back into stock only once.
    public void cancel(Order order) {
        if (order.isCanceled()) {
            return;
        }

        order.getItems().forEach(item -> stockService.release(item.getProduct(), item.getQuantity()));
        order.setFulfillmentStatus(FulfillmentStatus.CANCELED);
    }
}
